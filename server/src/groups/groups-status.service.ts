import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GroupStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayTouchGroup } from '../common/auth/group-branch-scope';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import {
  EntityHistoryService,
  type EntityStatusChangedEvent,
} from '../common/entity-history';
import { assertNoUnansweredLessons } from '../unmarked-lessons/unanswered-lessons';
import { ChangeGroupStatusDto } from './dto/change-group-status.dto';
import {
  groupInclude,
  formatGroup,
  GROUP_STATUS_TO_INT,
} from './shared/group-include';

/**
 * Group CRUD is `@Roles('CEO', 'Branch Director', 'Administrator')` — a Teacher
 * cannot reach it at all, so the "pure teacher → check by assignment" half of
 * `assertCallerMayTouchGroup` is unreachable here. An empty roles list takes
 * the BRANCH path, which is the answer for every caller who can actually get
 * this far; naming the constant says that on purpose rather than leaving a
 * bare `[]` for the next reader to wonder about.
 */
const NO_TEACHER_PATH: string[] = [];

/** What the admin reads when a status change rolled back as a whole. */
const STATUS_NOT_CHANGED =
  "Guruh holati o'zgarmadi, hech narsa saqlanmadi. Qayta urinib ko'ring.";

/**
 * A transaction that failed on its own terms and may pass on a second try:
 * a write conflict or deadlock (P2034, Postgres 40001 under Serializable)
 * and an expired or closed transaction (P2028).
 */
const RETRYABLE_TRANSACTION_CODES = new Set(['P2034', 'P2028']);

/** The statuses that end a group: nobody asks about its lessons after them. */
const CLOSING_STATUSES = new Set<GroupStatus>([
  GroupStatus.COMPLETED,
  GroupStatus.CANCELLED,
]);

@Injectable()
export class GroupsStatusService {
  private readonly logger = new Logger(GroupsStatusService.name);

  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * A group's status change commits everything it touches or nothing
   * (ADR-0041): the transition check and StatusHistory, the group's history,
   * closing its enrolments with their refunds and auto-graduation, and the
   * group row, in one Serializable transaction with the budget of a group
   * deletion. The 'entity.status.changed' events (system comment, Telegram
   * digest line) go out only after the commit.
   */
  async changeStatus(
    id: string,
    dto: ChangeGroupStatusDto,
    userId: number,
    companyId: number,
  ) {
    const found = await this.prisma.group.findFirst({
      where: { id, deletedAt: null, companyId },
      select: { id: true },
    });
    // A group status change CASCADES: CANCELLED/COMPLETED closes every open
    // enrolment. Done to another branch's group that is their students and
    // their teacher's accruals.
    await assertCallerMayTouchGroup(this.prisma, userId, NO_TEACHER_PATH, id);
    if (!found) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }

    // One instant for the group's change and its students', so the enrolment
    // state log closes exactly at the group's `statusChangedAt`.
    const at = new Date();
    const deferredEvents: EntityStatusChangedEvent[] = [];

    const updated = await this.prisma
      .$transaction(
        async (tx) => {
          // Read again inside the transaction: the transition is checked
          // against the status this transaction overwrites, so two admins
          // changing one group at once cannot both pass the check.
          const group = await tx.group.findFirst({
            where: { id, deletedAt: null, companyId },
          });
          if (!group) {
            throw new NotFoundException(`Guruh #${id} topilmadi`);
          }

          const auditData = await this.statusHistoryService.changeStatus({
            entityType: 'Group',
            entityId: id,
            fromStatus: group.statusEnum,
            toStatus: dto.status,
            reason: dto.reason,
            changedById: userId,
            companyId: group.companyId,
            tx,
          });

          // Read on the transaction: a question the sweep opens meanwhile
          // conflicts with it instead of being left behind (ADR-0068).
          if (CLOSING_STATUSES.has(dto.status)) {
            await assertNoUnansweredLessons(tx, { id });
          }

          await this.entityHistoryService.recordStatusChange({
            entityType: 'Group',
            entityId: id,
            oldValues: { status: group.statusEnum },
            newValues: { status: dto.status, reason: dto.reason },
            changedById: userId,
            companyId: group.companyId,
            tx,
            deferredEvents,
          });

          await this.statusCascadeService.cascadeGroupStatusChange(tx, {
            groupId: id,
            status: dto.status,
            userId,
            at,
            deferredEvents,
          });

          // The group row last: its student count in the response then
          // counts the enrolments as they end up.
          return tx.group.update({
            where: { id },
            data: {
              statusEnum: dto.status,
              status: GROUP_STATUS_TO_INT[dto.status] ?? group.status,
              isActive:
                dto.status === GroupStatus.ACTIVE ||
                dto.status === GroupStatus.FORMING,
              ...auditData,
              statusChangedAt: at,
            },
            include: groupInclude,
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 15_000,
          timeout: 60_000,
        },
      )
      .catch((err: unknown) => {
        throw this.failure(err, id);
      });

    this.entityHistoryService.emitStatusChanged(deferredEvents);
    return formatGroup(updated);
  }

  /**
   * What the admin is told when the change did not commit. An HttpException
   * (a refused transition, a missing group) is already written for them. Any
   * other failure rolled the whole change back: a write conflict or an
   * expired transaction is worth retrying (409), anything else is a fault
   * (500) and is logged. Both say that nothing was saved.
   */
  private failure(err: unknown, groupId: string): HttpException {
    if (err instanceof HttpException) return err;
    this.logger.error(
      `Group ${groupId}: status change rolled back`,
      err instanceof Error ? err.stack : String(err),
    );
    const retryable =
      err instanceof Prisma.PrismaClientKnownRequestError &&
      RETRYABLE_TRANSACTION_CODES.has(err.code);
    return retryable
      ? new ConflictException(STATUS_NOT_CHANGED)
      : new InternalServerErrorException(STATUS_NOT_CHANGED);
  }
}
