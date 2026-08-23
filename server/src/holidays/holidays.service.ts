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
import { buildHolidayDateSet } from './holiday-date-set';
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

  /**
   * Which holidays apply to a branch.
   *
   * `branchId IS NULL` is a COMPANY-WIDE holiday (Navro'z, Mustaqillik kuni) —
   * nearly every row — and applies everywhere. A non-null one is a single branch
   * closing, which the model could not express at all before.
   *
   * `branchId === undefined` means the caller does not know or does not care,
   * and gets every holiday. That is deliberate: these helpers have ~15 call
   * sites across attendance validation, billing, group cascades, crons and the
   * dashboard, and quietly changing what all of them see would be a far larger
   * behavioural change than adding the capability. Call sites opt in as they
   * learn their branch.
   */
  private branchWhere(branchId?: number) {
    return branchId === undefined
      ? {}
      : { OR: [{ branchId: null }, { branchId }] };
  }

  async findActiveHolidayCovering(
    date: Date,
    branchId?: number,
  ): Promise<HolidayCoverage | null> {
    return this.prisma.holiday.findFirst({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: { lte: date },
        endDate: { gte: date },
        ...this.branchWhere(branchId),
      },
      select: { id: true, name: true, date: true, endDate: true },
    });
  }

  async getActiveHolidaysInRange(
    rangeStart: Date,
    rangeEnd: Date,
    branchId?: number,
  ): Promise<HolidayCoverage[]> {
    return this.prisma.holiday.findMany({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: { lte: rangeEnd },
        endDate: { gte: rangeStart },
        ...this.branchWhere(branchId),
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
    branchId?: number,
  ): Promise<Set<string>> {
    // Implementatsiya `holiday-date-set.ts` da — bu servis
    // `GroupHolidayCascadeService` va `common/status` ni tortadi, ular esa
    // `billing → transactions` orqali qaytib keladi. Import halqasini
    // yopmaslik uchun to'lov kartasi o'sha faylni to'g'ridan-to'g'ri
    // chaqiradi; bu yerda nusxa emas, delegatsiya turadi.
    return buildHolidayDateSet(this.prisma, rangeStart, rangeEnd, branchId);
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async findAll(query: HolidayQueryDto, companyId?: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    // `GET /holidays` had no company filter and no `@Roles` guard, so any
    // authenticated token could read every holiday in the database.
    const where: Prisma.HolidayWhereInput = {
      deletedAt: null,
      ...(companyId != null ? { companyId } : {}),
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

  async findOne(id: string, companyId: number) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }
    return holiday;
  }

  async create(dto: CreateHolidayDto, userId: number, companyId: number) {
    const start = new Date(dto.date);
    const end = dto.endDate ? new Date(dto.endDate) : new Date(dto.date);

    this.validateRange(start, end);

    const holiday = await this.prisma.holiday.create({
      // Written explicitly, not left to the column default. The `@default(1001)`
      // that `20260805120000` added was a migration convenience; relying on it
      // at runtime would hardcode one company into a multi-company schema — and
      // the following migration drops it. `branchId` stays null: a holiday with
      // no branch is a COMPANY-WIDE one (Navro'z, Mustaqillik kuni), which is
      // what nearly every row is.
      data: { name: dto.name, date: start, endDate: end, companyId },
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

  async update(
    id: string,
    dto: UpdateHolidayDto,
    userId: number,
    companyId: number,
  ) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, companyId, deletedAt: null },
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

  async remove(id: string, userId: number, companyId: number) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, companyId, deletedAt: null },
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

  async changeStatus(
    id: string,
    dto: ChangeHolidayStatusDto,
    userId: number,
    companyId: number,
  ) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, companyId, deletedAt: null },
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

  async getStatusHistory(id: string, companyId: number) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, companyId },
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

  /**
   * Pushes every affected group's end date out by the holiday's length.
   *
   * Scoped two ways, neither of which it had:
   *
   * - **`companyId`** — the query matched every company's groups.
   * - **`branchId`** — `Holiday.branchId` is nullable ON PURPOSE: null is a
   *   company-wide holiday (Navro'z), a value is one branch closing. The
   *   cascade ignored the column entirely, so a holiday declared for Namangan
   *   would have extended Fargona's groups too. Two branches are live and four
   *   groups carry an `endDate` again after the 2026-07-20 reset, so this was
   *   waiting on the next branch-specific holiday rather than being harmless.
   */
  private async applyHolidayImpactOnGroups(
    holiday: {
      id: string;
      date: Date;
      endDate: Date;
      companyId: number;
      branchId: number | null;
    },
    userId: number,
  ): Promise<void> {
    const groups = await this.prisma.group.findMany({
      where: {
        companyId: holiday.companyId,
        ...(holiday.branchId != null ? { branchId: holiday.branchId } : {}),
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
