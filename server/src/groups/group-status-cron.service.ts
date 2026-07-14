import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
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
    private entityHistoryService: EntityHistoryService,
  ) {}

  // Har kuni Asia/Tashkent vaqti bilan 00:05 da ishlaydi.
  @Cron('0 5 0 * * *', { timeZone: 'Asia/Tashkent' })
  async autoUpdateGroupStatuses() {
    // "Bugun" — Toshkent kalendar kunining 00:00 (UTC ko'rinishida). Server
    // qaysi vaqt zonasida bo'lsa ham bir xil natija beradi. Avvalgi
    // `new Date().setHours(0,0,0,0)` server-lokal edi va cron Toshkent yarim
    // tunida (UTC bo'yicha oldingi kun 19:05) ishga tushganda "bugun" bir kun
    // orqada qolardi. Asia/Tashkent — UTC+5, DST yo'q.
    const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
    const tashkentNow = new Date(Date.now() + TASHKENT_OFFSET_MS);
    const today = new Date(
      Date.UTC(
        tashkentNow.getUTCFullYear(),
        tashkentNow.getUTCMonth(),
        tashkentNow.getUTCDate(),
      ),
    );

    // Guruhlarni endDate bo'yicha avtomatik COMPLETED qilish ATAY o'chirilgan
    // (2026-07-14, CEO qarori). Avtomatik yopish guruhni COMPLETED qilib,
    // o'quvchilarni kutilmaganda GRADUATED qilardi va keyin guruhni qo'lda
    // tiklashni talab qilardi. Guruh endi FAQAT qo'lda yopiladi
    // (PATCH /groups/:id/status). FORMING→ACTIVE avtomatik faollashtirish
    // saqlanib qoladi.
    await this.activateGroups(today);
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
