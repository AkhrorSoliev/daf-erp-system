import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
