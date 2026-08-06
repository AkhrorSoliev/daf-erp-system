import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayTouchGroup } from '../common/auth/group-branch-scope';

/**
 * Group CRUD is `@Roles('CEO', 'Branch Director', 'Administrator')` — a Teacher
 * cannot reach it at all, so the "pure teacher → check by assignment" half of
 * `assertCallerMayTouchGroup` is unreachable here. An empty roles list takes
 * the BRANCH path, which is the answer for every caller who can actually get
 * this far; naming the constant says that on purpose rather than leaving a
 * bare `[]` for the next reader to wonder about.
 */
const NO_TEACHER_PATH: string[] = [];
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { ChangeGroupStatusDto } from './dto/change-group-status.dto';
import { GroupStatus } from '@prisma/client';
import {
  groupInclude,
  formatGroup,
  GROUP_STATUS_TO_INT,
} from './shared/group-include';

@Injectable()
export class GroupsStatusService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async changeStatus(
    id: string,
    dto: ChangeGroupStatusDto,
    userId: number,
    companyId: number,
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id, deletedAt: null, companyId },
    });
    // A group status change CASCADES: CANCELLED/COMPLETED flips every active
    // enrolment. Done to another branch's group that is their students and
    // their teacher's accruals.
    await assertCallerMayTouchGroup(this.prisma, userId, NO_TEACHER_PATH, id);

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
      companyId: group.companyId ?? undefined,
    });

    const updated = await this.prisma.group.update({
      where: { id },
      data: {
        statusEnum: dto.status,
        status: GROUP_STATUS_TO_INT[dto.status] ?? group.status,
        isActive:
          dto.status === GroupStatus.ACTIVE ||
          dto.status === GroupStatus.FORMING,
        ...auditData,
      },
      include: groupInclude,
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Group',
      entityId: id,
      oldValues: { status: group.statusEnum },
      newValues: { status: dto.status, reason: dto.reason },
      changedById: userId,
      companyId: group.companyId ?? undefined,
    });

    // Cascade: COMPLETED/CANCELLED → enrollment larni yangilash
    await this.statusCascadeService.cascade('Group', id, dto.status, userId);

    return formatGroup(updated);
  }
}
