import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { type StudentJoinRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';
import { StudentLeadOriginService } from '../common/student-origin';
import { assertCallerInBranch } from '../common/auth/branch-scope';
import { loadContactPhone } from '../balance-notices/load-transfer-state';
import { registerStudentFromTelegram } from '../telegram/scenes/student-registration-flow';
import { isEnrollableGroupStatus } from '../groups/shared/enrollable-statuses';
import {
  closeJoinRequestTask,
  type JoinTaskCloseReason,
} from '../tasks/join-request-task';
import {
  JOIN_REQUEST_MESSAGE,
  type JoinRequestMessageEvent,
} from './join-request-events';
import {
  joinRequestApprovedText,
  joinRequestExpiredText,
  joinRequestRejectedText,
  scheduleText,
} from './join-request-texts';
import {
  closeAfterCommit,
  loadJoinGroup,
  teacherNameOf,
} from './join-request-shared';
import { loadJoinRequestView, type JoinRequestView } from './join-request-view';

const EXPIRE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** A run closes at most this many; the next day takes the rest. */
const EXPIRE_BATCH = 200;

export const ALREADY_DECIDED = "Bu so'rov allaqachon ko'rib chiqilgan";
const GROUP_NOT_ENROLLABLE =
  "Bu guruhga yozib bo'lmaydi — boshqa guruhni tanlang";
const BRANCH_NOT_ACTIVE = "Filial faol emas — so'rovni tasdiqlab bo'lmaydi";

export interface JoinRequestCaller {
  id: number;
  companyId: number;
  /** Role names, as `PermissionGuard` read them from the database. */
  roles: string[];
}

/**
 * The «Dars bo'ldimi?» rule (ADR-0054): the administrator who took the task
 * decides; the CEO and a Branch Director always may.
 */
export async function assertMayDecide(
  db: Pick<PrismaService, 'user'>,
  claimedById: number | null,
  caller: JoinRequestCaller,
): Promise<void> {
  if (claimedById === null || claimedById === caller.id) return;
  if (caller.roles.includes('CEO') || caller.roles.includes('Branch Director'))
    return;
  const holder = await db.user.findUnique({
    where: { id: claimedById },
    select: { firstName: true, lastName: true },
  });
  throw new ConflictException(
    holder
      ? `Bu so'rovni ${holder.firstName} ${holder.lastName} ko'rib chiqmoqda`
      : "Bu so'rovni boshqa administrator ko'rib chiqmoqda",
  );
}

/**
 * Deciding a join request (ADR-0080): approve, reject, the day-7 expiry and
 * the request view the task sheet reads. `StudentJoinRequestsService` takes
 * requests in; this one closes them.
 */
@Injectable()
export class JoinRequestDecisionsService {
  private readonly logger = new Logger(JoinRequestDecisionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
    private readonly history: EntityHistoryService,
    private readonly leadOrigin: StudentLeadOriginService,
    private readonly events: EventEmitter2,
  ) {}

  async getByTask(
    taskId: string,
    caller: JoinRequestCaller,
  ): Promise<JoinRequestView> {
    const request = await this.prisma.studentJoinRequest.findFirst({
      where: { taskId, companyId: caller.companyId },
    });
    if (!request) throw new NotFoundException("So'rov topilmadi");
    await assertCallerInBranch(this.prisma, caller.id, request.branchId);
    return loadJoinRequestView(this.prisma, request);
  }

  async approve(
    id: string,
    groupId: string | undefined,
    caller: JoinRequestCaller,
  ): Promise<{ status: 'APPROVED'; studentId: number; delivered: boolean }> {
    const request = await this.loadForDecision(id, caller);
    const group = await loadJoinGroup(this.prisma, groupId ?? request.groupId);
    if (
      !group ||
      group.branchId !== request.branchId ||
      group.deletedAt !== null ||
      !isEnrollableGroupStatus(group.statusEnum)
    ) {
      throw new BadRequestException(GROUP_NOT_ENROLLABLE);
    }
    if (group.branch.status !== 'ACTIVE' || group.branch.deletedAt !== null) {
      throw new BadRequestException(BRANCH_NOT_ACTIVE);
    }
    const [phoneCard, chatCard] = await Promise.all([
      this.prisma.student.findFirst({
        where: { phone: request.phone, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.student.findFirst({
        where: { telegramChatId: request.chatId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (phoneCard) {
      throw new BadRequestException(
        `Bu raqam #${phoneCard.id} o'quvchida bor — so'rovni rad eting yoki o'sha kartani oching`,
      );
    }
    if (chatCard) {
      throw new BadRequestException(
        `Bu Telegram #${chatCard.id} o'quvchiga bog'langan`,
      );
    }

    const now = new Date();
    let studentId = 0;
    let committed = false;
    let plainPassword: string;
    // The card keeps the photo; only the bell rows close.
    const closeBells = () =>
      closeAfterCommit(this.upload, this.events, { ...request, photo: null });
    try {
      ({ plainPassword } = await registerStudentFromTelegram(
        this.prisma,
        this.history,
        this.leadOrigin,
        {
          firstName: request.firstName,
          lastName: request.lastName,
          phone: request.phone,
          photo: request.photo,
          branchId: request.branchId,
          groupId: group.id,
          groupName: group.name,
        },
        request.chatId,
        this.events,
        {
          actorId: caller.id,
          // Taken in the card's own transaction: a second approval finds it
          // decided and its card is rolled back.
          inTx: async (tx, newStudentId) => {
            studentId = newStudentId;
            const { count } = await tx.studentJoinRequest.updateMany({
              where: { id: request.id, status: 'PENDING' },
              data: {
                status: 'APPROVED',
                decidedById: caller.id,
                decidedAt: now,
                approvedGroupId: group.id,
                studentId: newStudentId,
              },
            });
            if (count === 0) throw new ConflictException(ALREADY_DECIDED);
            await closeJoinRequestTask(
              tx,
              request.taskId,
              caller.id,
              'JOIN_APPROVED',
            );
          },
          onCommit: () => {
            committed = true;
          },
        },
      ));
    } catch (error) {
      if (!committed) {
        // Nothing was written. A unique clash here is a write the checks
        // above could not see yet (a racing card on the same phone or chat).
        if ((error as { code?: string }).code === 'P2002') {
          throw new ConflictException("Bu ma'lumotlar allaqachon tizimda bor");
        }
        throw error;
      }
      // The card, its group and its account are in and the request is
      // decided; a history row or the charge event after the commit failed.
      // The bell rows still close; the error surfaces as what it is.
      this.logger.error(
        `So'rov ${request.id} tasdiqlandi (o'quvchi #${studentId}), keyingi qadam bajarilmadi: ${(error as Error).message}`,
      );
      await closeBells();
      throw error;
    }

    await closeBells();
    const delivered = await this.sendToPerson({
      chatId: request.chatId,
      photo: request.photo,
      text: joinRequestApprovedText({
        firstName: request.firstName,
        groupName: group.name,
        teacherName: teacherNameOf(group),
        schedule: scheduleText(group),
        phone: request.phone,
        password: plainPassword,
      }),
    });
    return { status: 'APPROVED', studentId, delivered };
  }

  async reject(
    id: string,
    reason: string,
    caller: JoinRequestCaller,
  ): Promise<{ status: 'REJECTED' }> {
    const request = await this.loadForDecision(id, caller);
    if (!(await this.closeRequest(request, 'REJECTED', caller.id, reason))) {
      throw new ConflictException(ALREADY_DECIDED);
    }
    await this.tellClosed(request, joinRequestRejectedText);
    return { status: 'REJECTED' };
  }

  /**
   * Day 7 (spec §6.3): a request nobody decided closes and the person is
   * told. Never approved by silence. 09:00 Tashkent, Sundays included.
   */
  @Cron('0 0 9 * * *', { timeZone: 'Asia/Tashkent' })
  async expireOld(now: Date = new Date()): Promise<number> {
    const rows = await this.prisma.studentJoinRequest.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: new Date(now.getTime() - EXPIRE_AFTER_MS) },
      },
      orderBy: { createdAt: 'asc' },
      take: EXPIRE_BATCH,
    });
    let closed = 0;
    for (const request of rows) {
      try {
        if (!(await this.closeRequest(request, 'EXPIRED', null, null))) {
          continue;
        }
        closed++;
        await this.tellClosed(request, joinRequestExpiredText);
      } catch (error) {
        this.logger.error(
          `So'rov ${request.id} yopilmadi: ${(error as Error).message}`,
        );
      }
    }
    if (closed > 0) {
      this.logger.log(`Muddati o'tgan so'rovlar yopildi: ${closed}`);
    }
    return closed;
  }

  private async loadForDecision(
    id: string,
    caller: JoinRequestCaller,
  ): Promise<StudentJoinRequest> {
    const request = await this.prisma.studentJoinRequest.findFirst({
      where: { id, companyId: caller.companyId },
    });
    if (!request) throw new NotFoundException("So'rov topilmadi");
    await assertCallerInBranch(this.prisma, caller.id, request.branchId);
    if (request.status !== 'PENDING') {
      throw new ConflictException(ALREADY_DECIDED);
    }
    if (request.taskId) {
      const task = await this.prisma.task.findUnique({
        where: { id: request.taskId },
        select: { claimedById: true },
      });
      await assertMayDecide(this.prisma, task?.claimedById ?? null, caller);
    }
    return request;
  }

  /** REJECTED or EXPIRED, with the task closed; false when it was decided meanwhile. */
  private async closeRequest(
    request: StudentJoinRequest,
    status: 'REJECTED' | 'EXPIRED',
    actorId: number | null,
    reason: string | null,
  ): Promise<boolean> {
    const closeReason: JoinTaskCloseReason =
      status === 'REJECTED' ? 'JOIN_REJECTED' : 'JOIN_EXPIRED';
    const now = new Date();
    const closed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.studentJoinRequest.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: {
          status,
          decidedById: actorId,
          decidedAt: now,
          rejectReason: reason,
          photo: null,
        },
      });
      if (count === 0) return false;
      await closeJoinRequestTask(tx, request.taskId, actorId, closeReason);
      return true;
    });
    if (closed) await closeAfterCommit(this.upload, this.events, request);
    return closed;
  }

  /** The rejection or expiry message, with the branch's phone. */
  private async tellClosed(
    request: StudentJoinRequest,
    text: (p: {
      firstName: string;
      groupName: string;
      phone: string | null;
    }) => string,
  ): Promise<void> {
    const [group, phone] = await Promise.all([
      this.prisma.group.findUnique({
        where: { id: request.groupId },
        select: { name: true },
      }),
      loadContactPhone(this.prisma, request.branchId, request.companyId),
    ]);
    await this.sendToPerson({
      chatId: request.chatId,
      photo: null,
      text: text({
        firstName: request.firstName,
        groupName: group?.name ?? '—',
        phone,
      }),
    });
  }

  /** True when `JoinRequestNotifier` delivered it; no bot or a failure is false. */
  private async sendToPerson(
    message: JoinRequestMessageEvent,
  ): Promise<boolean> {
    try {
      const results: unknown[] = await this.events.emitAsync(
        JOIN_REQUEST_MESSAGE,
        message,
      );
      return results.some((r) => r === true);
    } catch (error) {
      this.logger.warn(
        `So'rov xabari yuborilmadi (chat ${message.chatId}): ${(error as Error).message}`,
      );
      return false;
    }
  }
}
