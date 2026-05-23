import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { Holiday, HolidayStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { ChangeHolidayStatusDto } from './dto/change-holiday-status.dto';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { HolidayQueryDto } from './dto/holiday-query.dto';
import { GroupHolidayCascadeService } from '../groups/group-holiday-cascade.service';
import {
  addDaysToDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../attendance/shared/date-utils';

const MAX_HOLIDAY_DAYS = 60;

type HolidayCoverage = Pick<Holiday, 'id' | 'name' | 'date' | 'endDate'>;

@Injectable()
export class HolidaysService {
  private readonly logger = new Logger(HolidaysService.name);

  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private entityHistoryService: EntityHistoryService,
    @Inject(forwardRef(() => GroupHolidayCascadeService))
    private groupHolidayCascadeService: GroupHolidayCascadeService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public read helpers — these are the canonical entry points every other
  // service should use instead of querying prisma.holiday directly.
  // ---------------------------------------------------------------------------

  async findActiveHolidayCovering(date: Date): Promise<HolidayCoverage | null> {
    return this.prisma.holiday.findFirst({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: { lte: date },
        endDate: { gte: date },
      },
      select: { id: true, name: true, date: true, endDate: true },
    });
  }

  async getActiveHolidaysInRange(
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<HolidayCoverage[]> {
    return this.prisma.holiday.findMany({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: { lte: rangeEnd },
        endDate: { gte: rangeStart },
      },
      select: { id: true, name: true, date: true, endDate: true },
    });
  }

  /**
   * Returns the Set of YYYY-MM-DD (Tashkent calendar) dates covered by an
   * active holiday inside `[rangeStart, rangeEnd]`. Pads the query bounds
   * by ±1 day to absorb UTC vs Tashkent midnight skew.
   */
  async buildHolidayDateSet(
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<Set<string>> {
    const paddedStart = new Date(rangeStart.getTime() - 24 * 60 * 60 * 1000);
    const paddedEnd = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000);

    const holidays = await this.getActiveHolidaysInRange(paddedStart, paddedEnd);

    const rangeStartStr = tashkentDateStr(rangeStart);
    const rangeEndStr = tashkentDateStr(rangeEnd);

    const set = new Set<string>();
    for (const h of holidays) {
      let cursor = tashkentDateStr(h.date);
      const end = tashkentDateStr(h.endDate);
      while (cursor <= end) {
        if (cursor >= rangeStartStr && cursor <= rangeEndStr) {
          set.add(cursor);
        }
        cursor = addDaysToDateStr(cursor, 1);
      }
    }
    return set;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

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
    const start = new Date(dto.date);
    const end = dto.endDate ? new Date(dto.endDate) : new Date(dto.date);

    this.validateRange(start, end);

    const holiday = await this.prisma.holiday.create({
      data: { name: dto.name, date: start, endDate: end },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'Holiday',
      entityId: holiday.id,
      newValues: holiday,
      changedById: userId,
    });

    await this.applyHolidayImpactOnGroups(holiday, userId);

    return holiday;
  }

  async update(id: string, dto: UpdateHolidayDto, userId: number) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, deletedAt: null },
    });
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }

    // Compare Tashkent calendar strings — the frontend sends "YYYY-MM-DD",
    // but the DB row could be UTC midnight or Tashkent midnight depending on
    // how it was stored. Squash both sides to the calendar day so a name-only
    // edit doesn't accidentally count as a date change.
    const currentDateStr = tashkentDateStr(holiday.date);
    const currentEndDateStr = tashkentDateStr(holiday.endDate);
    const wantsDateChange =
      (dto.date !== undefined && dto.date !== currentDateStr) ||
      (dto.endDate !== undefined && dto.endDate !== currentEndDateStr);

    if (wantsDateChange) {
      const extensionCount = await this.prisma.groupHolidayExtension.count({
        where: { holidayId: id },
      });
      if (extensionCount > 0) {
        throw new BadRequestException(
          "Bu bayram allaqachon guruh jadvallariga ta'sir qilgan. " +
            "Sanalarini o'zgartirish uchun avval bayramni o'chiring, " +
            'so\'ng qayta yarating',
        );
      }

      const nextStart = dto.date ? new Date(dto.date) : holiday.date;
      const nextEnd = dto.endDate
        ? new Date(dto.endDate)
        : dto.date
          ? new Date(dto.date)
          : holiday.endDate;
      this.validateRange(nextStart, nextEnd);
    }

    const updated = await this.prisma.holiday.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.endDate !== undefined
          ? { endDate: new Date(dto.endDate) }
          : dto.date !== undefined
            ? { endDate: new Date(dto.date) }
            : {}),
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

    await this.reverseHolidayImpactOnGroups(id, userId);

    await this.prisma.holiday.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
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
      data: { status: dto.status, ...auditData },
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Holiday',
      entityId: id,
      oldValues: { status: holiday.status },
      newValues: { status: dto.status, reason: dto.reason },
      changedById: userId,
    });

    if (
      holiday.status === HolidayStatus.ACTIVE &&
      dto.status === HolidayStatus.CANCELLED
    ) {
      await this.reverseHolidayImpactOnGroups(id, userId);
    } else if (
      holiday.status === HolidayStatus.CANCELLED &&
      dto.status === HolidayStatus.ACTIVE
    ) {
      await this.applyHolidayImpactOnGroups(updated, userId);
    }

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

  // ---------------------------------------------------------------------------
  // Cascade — public so the cascade service can call back for the date set.
  // ---------------------------------------------------------------------------

  private validateRange(start: Date, end: Date) {
    if (end < start) {
      throw new BadRequestException(
        "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas",
      );
    }
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > MAX_HOLIDAY_DAYS) {
      throw new BadRequestException(
        `Bayram davomiyligi ${MAX_HOLIDAY_DAYS} kundan oshmasligi kerak`,
      );
    }
  }

  private async applyHolidayImpactOnGroups(
    holiday: { id: string; date: Date; endDate: Date },
    userId: number,
  ): Promise<void> {
    const groups = await this.prisma.group.findMany({
      where: {
        deletedAt: null,
        statusEnum: { in: ['FORMING', 'ACTIVE'] },
        startDate: { lte: holiday.endDate },
        endDate: { gte: holiday.date },
      },
      select: { id: true },
    });

    for (const group of groups) {
      try {
        await this.groupHolidayCascadeService.extendGroupEndDateForHoliday(
          group.id,
          holiday.id,
          userId,
        );
      } catch (err) {
        this.logger.warn(
          `extendGroupEndDateForHoliday failed for group=${group.id} holiday=${holiday.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async reverseHolidayImpactOnGroups(
    holidayId: string,
    userId: number,
  ): Promise<void> {
    const extensions = await this.prisma.groupHolidayExtension.findMany({
      where: { holidayId },
    });

    for (const extension of extensions) {
      try {
        await this.groupHolidayCascadeService.revertGroupEndDateForHoliday(
          extension,
          userId,
        );
      } catch (err) {
        this.logger.warn(
          `revertGroupEndDateForHoliday failed for extension=${extension.id}: ${(err as Error).message}`,
        );
      }
    }
  }
}

// Re-export date helpers from this module for symmetry — kept here so callers
// only need to import HolidaysService to get range-aware behaviour.
export { utcMidnightFromDateStr, tashkentDateStr };
