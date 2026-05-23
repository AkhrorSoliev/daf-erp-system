import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { ChangeHolidayStatusDto } from './dto/change-holiday-status.dto';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { HolidayQueryDto } from './dto/holiday-query.dto';

@Injectable()
export class HolidaysService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async findAll(query: HolidayQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.HolidayWhereInput = {
      deletedAt: null,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.holiday.findMany({
        where,
        orderBy: { date: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.holiday.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: string) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, deletedAt: null },
    });
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }
    return holiday;
  }

  async create(dto: CreateHolidayDto, userId: number) {
    const holiday = await this.prisma.holiday.create({
      data: {
        name: dto.name,
        date: new Date(dto.date),
      },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'Holiday',
      entityId: holiday.id,
      newValues: holiday,
      changedById: userId,
    });

    return holiday;
  }

  async update(id: string, dto: UpdateHolidayDto, userId: number) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, deletedAt: null },
    });
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }

    const updated = await this.prisma.holiday.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
      },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'Holiday',
      entityId: id,
      oldValues: holiday,
      newValues: updated,
      changedById: userId,
    });

    return updated;
  }

  async remove(id: string, userId: number) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, deletedAt: null },
    });
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }

    await this.prisma.holiday.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
    });

    await this.entityHistoryService.recordDelete({
      entityType: 'Holiday',
      entityId: id,
      oldValues: holiday,
      changedById: userId,
    });

    return { message: "Bayram muvaffaqiyatli o'chirildi" };
  }

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
        status: dto.status,
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
