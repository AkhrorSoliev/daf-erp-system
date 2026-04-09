import { Injectable, NotFoundException } from '@nestjs/common';
import { HolidayStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { ChangeHolidayStatusDto } from './dto/change-holiday-status.dto';

@Injectable()
export class HolidaysService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async changeStatus(id: string, dto: ChangeHolidayStatusDto, userId: number) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, deletedAt: null },
    });

    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }

    const auditData = await this.statusHistoryService.changeStatus({
      entityType: 'Holiday',
      entityId: id,
      fromStatus: holiday.status,
      toStatus: dto.status,
      reason: dto.reason,
      changedById: userId,
    });

    const updated = await this.prisma.holiday.update({
      where: { id },
      data: {
        status: dto.status as HolidayStatus,
        ...auditData,
      },
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Holiday',
      entityId: id,
      oldValues: { status: holiday.status },
      newValues: { status: dto.status, reason: dto.reason },
      changedById: userId,
    });

    return updated;
  }

  async getStatusHistory(id: string) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id },
      select: { id: true },
    });

    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }

    return this.statusHistoryService.getHistory('Holiday', id);
  }
}
