import { Injectable, NotFoundException } from '@nestjs/common';
import { HolidayStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { ChangeHolidayStatusDto } from './dto/change-holiday-status.dto';

@Injectable()
export class HolidaysService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
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

    return this.prisma.holiday.update({
      where: { id },
      data: {
        status: dto.status as HolidayStatus,
        ...auditData,
      },
    });
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
