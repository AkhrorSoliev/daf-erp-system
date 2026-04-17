import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';

const GROUP_STATUS_TO_INT: Record<string, number> = {
  ACTIVE: 1,
  FORMING: 2,
  PAUSED: 3,
  CANCELLED: 4,
  COMPLETED: 4,
};

@Injectable()
export class GroupStatusCronService {
  private readonly logger = new Logger(GroupStatusCronService.name);

  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  // Har kuni soat 00:05 da ishlaydi
  @Cron('0 5 0 * * *')
  async autoUpdateGroupStatuses() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.activateGroups(today);
    await this.completeGroups(today);
  }

  /**
   * startDate kelgan FORMING guruhlarni ACTIVE ga o'tkazadi
   */
  private async activateGroups(today: Date) {
    const groups = await this.prisma.group.findMany({
      where: {
        statusEnum: GroupStatus.FORMING,
        startDate: { lte: today },
        deletedAt: null,
      },
    });

    if (groups.length === 0) return;

    this.logger.log(
      `${groups.length} ta guruh FORMING → ACTIVE ga o'tkazilmoqda`,
    );

    for (const group of groups) {
      try {
        await this.changeGroupStatus(
          group,
          GroupStatus.ACTIVE,
          'Avtomatik: guruh boshlanish sanasi keldi',
        );
      } catch (error) {
        this.logger.error(
          `FORMING→ACTIVE xatolik, guruh ${group.id}: ${error.message}`,
        );
      }
    }
  }

  /**
   * endDate o'tgan ACTIVE guruhlarni COMPLETED ga o'tkazadi
   */
  private async completeGroups(today: Date) {
    const groups = await this.prisma.group.findMany({
      where: {
        statusEnum: GroupStatus.ACTIVE,
        endDate: { lt: today },
        deletedAt: null,
      },
    });

    if (groups.length === 0) return;

    this.logger.log(
      `${groups.length} ta guruh ACTIVE → COMPLETED ga o'tkazilmoqda`,
    );

    for (const group of groups) {
      try {
        await this.changeGroupStatus(
          group,
          GroupStatus.COMPLETED,
          "Avtomatik: guruh tugash sanasi o'tdi",
        );

        // COMPLETED → enrollment va studentlarni cascade qilish
        await this.statusCascadeService.cascade(
          'Group',
          group.id,
          GroupStatus.COMPLETED,
          0,
        );
      } catch (error) {
        this.logger.error(
          `ACTIVE→COMPLETED xatolik, guruh ${group.id}: ${error.message}`,
        );
      }
    }
  }

  private async changeGroupStatus(
    group: { id: string; statusEnum: string; companyId: number | null },
    toStatus: GroupStatus,
    reason: string,
  ) {
    const auditData = await this.statusHistoryService.changeStatus({
      entityType: 'Group',
      entityId: group.id,
      fromStatus: group.statusEnum,
      toStatus,
      reason,
      changedById: undefined,
      companyId: group.companyId ?? undefined,
    });

    await this.prisma.group.update({
      where: { id: group.id },
      data: {
        statusEnum: toStatus,
        status: GROUP_STATUS_TO_INT[toStatus] ?? 2,
        isActive:
          toStatus === GroupStatus.ACTIVE || toStatus === GroupStatus.FORMING,
        ...auditData,
      },
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Group',
      entityId: group.id,
      oldValues: { status: group.statusEnum },
      newValues: { status: toStatus, reason },
      changedById: undefined,
      companyId: group.companyId ?? undefined,
    });

    this.logger.log(`Guruh ${group.id}: ${group.statusEnum} → ${toStatus}`);
  }
}
