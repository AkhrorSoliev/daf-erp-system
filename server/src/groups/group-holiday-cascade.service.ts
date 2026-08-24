import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { GroupHolidayExtension, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { HolidaysService } from '../holidays/holidays.service';
import {
  DAY_NAME_TO_JS,
  addDaysToDateStr,
  dayOfWeekForDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../attendance/shared/date-utils';

/**
 * Cascade lifecycle of holiday ranges onto group endDates.
 *
 * - On holiday create: every overlapping ACTIVE/FORMING group gets its
 *   `endDate` pushed forward by the count of scheduled days the holiday
 *   eats from `[startDate, endDate]`. The new tail dates skip future
 *   holidays so the group really gains those lessons.
 * - On holiday delete (or ACTIVE→CANCELLED): the extension reverses to
 *   the original endDate.
 *
 * Idempotency is enforced by the `@@unique([groupId, holidayId])` on
 * `GroupHolidayExtension` plus a findUnique check at the top of `extend`.
 */
@Injectable()
export class GroupHolidayCascadeService {
  private readonly logger = new Logger(GroupHolidayCascadeService.name);
  private static readonly MAX_WALK_ITERATIONS = 400;

  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    @Inject(forwardRef(() => HolidaysService))
    private holidaysService: HolidaysService,
  ) {}

  async extendGroupEndDateForHoliday(
    groupId: string,
    holidayId: string,
    userId: number,
  ): Promise<{
    extended: boolean;
    oldEndDate: Date | null;
    newEndDate: Date | null;
    daysExtended: number;
  }> {
    const existing = await this.prisma.groupHolidayExtension.findUnique({
      where: { groupId_holidayId: { groupId, holidayId } },
    });
    if (existing) {
      return {
        extended: false,
        oldEndDate: existing.oldEndDate,
        newEndDate: existing.newEndDate,
        daysExtended: existing.daysExtended,
      };
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        exactDays: true,
      },
    });
    if (!group || !group.startDate || !group.endDate) {
      return {
        extended: false,
        oldEndDate: null,
        newEndDate: null,
        daysExtended: 0,
      };
    }

    const holiday = await this.prisma.holiday.findUnique({
      where: { id: holidayId },
      select: { id: true, date: true, endDate: true },
    });
    if (!holiday) {
      return {
        extended: false,
        oldEndDate: group.endDate,
        newEndDate: group.endDate,
        daysExtended: 0,
      };
    }

    const scheduledDayNums = new Set(
      group.exactDays
        .map((d) => DAY_NAME_TO_JS[d.toLowerCase()])
        .filter((v): v is number => typeof v === 'number'),
    );
    if (scheduledDayNums.size === 0) {
      return {
        extended: false,
        oldEndDate: group.endDate,
        newEndDate: group.endDate,
        daysExtended: 0,
      };
    }

    // Compute the eaten window in Tashkent calendar strings up front so
    // boundaries don't depend on how each Date instant happens to be
    // stored (UTC midnight vs Tashkent midnight). The Date instants below
    // are derived purely for downstream Prisma queries.
    const groupStartStr = tashkentDateStr(group.startDate);
    const groupEndStr = tashkentDateStr(group.endDate);
    const holidayStartStr = tashkentDateStr(holiday.date);
    const holidayEndStr = tashkentDateStr(holiday.endDate);

    const eatenStartStr =
      groupStartStr > holidayStartStr ? groupStartStr : holidayStartStr;
    const eatenEndStr =
      groupEndStr < holidayEndStr ? groupEndStr : holidayEndStr;

    if (eatenEndStr < eatenStartStr) {
      return {
        extended: false,
        oldEndDate: group.endDate,
        newEndDate: group.endDate,
        daysExtended: 0,
      };
    }

    // Collect Tashkent calendar dates owned by OTHER active holidays that
    // started strictly EARLIER than this one — they get first claim on any
    // overlapping day so a single lesson isn't extended twice. Holidays
    // starting on the same day or later don't block this one.
    const overlappingHolidays =
      await this.holidaysService.getActiveHolidaysInRange(
        utcMidnightFromDateStr(eatenStartStr),
        utcMidnightFromDateStr(eatenEndStr),
      );
    const earlierClaimedDates = new Set<string>();
    for (const other of overlappingHolidays) {
      if (other.id === holiday.id) continue;
      if (other.date >= holiday.date) continue;
      let oc = tashkentDateStr(other.date);
      const oe = tashkentDateStr(other.endDate);
      while (oc <= oe) {
        if (oc >= eatenStartStr && oc <= eatenEndStr) {
          earlierClaimedDates.add(oc);
        }
        oc = addDaysToDateStr(oc, 1);
      }
    }

    const eatenDates: string[] = [];
    let cursor = eatenStartStr;
    while (cursor <= eatenEndStr) {
      if (
        scheduledDayNums.has(dayOfWeekForDateStr(cursor)) &&
        !earlierClaimedDates.has(cursor)
      ) {
        eatenDates.push(cursor);
      }
      cursor = addDaysToDateStr(cursor, 1);
    }

    if (eatenDates.length === 0) {
      return {
        extended: false,
        oldEndDate: group.endDate,
        newEndDate: group.endDate,
        daysExtended: 0,
      };
    }

    // Walk forward from the day after current endDate, skipping any date
    // that already lies in any active holiday.
    const walkStart = new Date(group.endDate.getTime() + 24 * 60 * 60 * 1000);
    const walkEnd = new Date(walkStart.getTime() + 365 * 24 * 60 * 60 * 1000);
    const futureHolidaySet = await this.holidaysService.buildHolidayDateSet(
      walkStart,
      walkEnd,
    );

    let counter = 0;
    let candidate = tashkentDateStr(walkStart);
    let iterations = 0;
    let newEndStr: string | null = null;

    while (iterations < GroupHolidayCascadeService.MAX_WALK_ITERATIONS) {
      if (
        scheduledDayNums.has(dayOfWeekForDateStr(candidate)) &&
        !futureHolidaySet.has(candidate)
      ) {
        counter++;
        if (counter === eatenDates.length) {
          newEndStr = candidate;
          break;
        }
      }
      candidate = addDaysToDateStr(candidate, 1);
      iterations++;
    }

    if (!newEndStr) {
      this.logger.warn(
        `extendGroupEndDateForHoliday: hit walk cap for group=${groupId} holiday=${holidayId} — endDate left untouched`,
      );
      return {
        extended: false,
        oldEndDate: group.endDate,
        newEndDate: group.endDate,
        daysExtended: 0,
      };
    }

    const newEndDate = utcMidnightFromDateStr(newEndStr);
    const oldEndDate = group.endDate;

    await this.prisma.$transaction(
      async (tx) => {
        await tx.group.update({
          where: { id: groupId },
          data: { endDate: newEndDate },
        });
        await tx.groupHolidayExtension.create({
          data: {
            groupId,
            holidayId,
            daysExtended: eatenDates.length,
            oldEndDate,
            newEndDate,
            createdById: userId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.entityHistoryService.recordUpdate({
      entityType: 'Group',
      entityId: groupId,
      oldValues: { tugashSanasi: oldEndDate },
      newValues: { tugashSanasi: newEndDate },
      changedById: userId,
    });

    return {
      extended: true,
      oldEndDate,
      newEndDate,
      daysExtended: eatenDates.length,
    };
  }

  async revertGroupEndDateForHoliday(
    extension: GroupHolidayExtension,
    userId: number,
  ): Promise<void> {
    const group = await this.prisma.group.findUnique({
      where: { id: extension.groupId },
      select: { id: true, endDate: true },
    });
    if (!group) {
      await this.prisma.groupHolidayExtension.delete({
        where: { id: extension.id },
      });
      return;
    }

    // If admin manually changed endDate in between, don't clobber it —
    // just drop the extension record and warn.
    const currentEndDate = group.endDate ? group.endDate.getTime() : null;
    const expectedEndDate = extension.newEndDate.getTime();

    if (currentEndDate !== expectedEndDate) {
      this.logger.warn(
        `revertGroupEndDateForHoliday: group=${extension.groupId} endDate ` +
          `changed since extension (expected=${extension.newEndDate.toISOString()}, ` +
          `got=${group.endDate?.toISOString() ?? 'null'}). Dropping extension record without changing endDate.`,
      );
      await this.prisma.groupHolidayExtension.delete({
        where: { id: extension.id },
      });
      return;
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.group.update({
          where: { id: extension.groupId },
          data: { endDate: extension.oldEndDate },
        });
        await tx.groupHolidayExtension.delete({
          where: { id: extension.id },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.entityHistoryService.recordUpdate({
      entityType: 'Group',
      entityId: extension.groupId,
      oldValues: { tugashSanasi: extension.newEndDate },
      newValues: { tugashSanasi: extension.oldEndDate },
      changedById: userId,
    });
  }

  /**
   * Apply every currently-active holiday's impact to a newly-created group.
   * Holidays are processed in chronological order so each one sees the
   * already-extended endDate from the prior holidays.
   */
  async applyHolidayImpactOnNewGroup(
    groupId: string,
    userId: number,
  ): Promise<void> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { startDate: true, endDate: true },
    });
    if (!group?.startDate || !group?.endDate) return;

    // Keep iterating in case an earlier extension pushed endDate into a
    // later holiday's range.
    let lastEndDate = group.endDate;
    while (true) {
      const holidays = await this.holidaysService.getActiveHolidaysInRange(
        group.startDate,
        lastEndDate,
      );
      holidays.sort((a, b) => a.date.getTime() - b.date.getTime());

      let extendedAny = false;
      for (const holiday of holidays) {
        const result = await this.extendGroupEndDateForHoliday(
          groupId,
          holiday.id,
          userId,
        );
        if (result.extended) {
          extendedAny = true;
          if (result.newEndDate) lastEndDate = result.newEndDate;
        }
      }

      if (!extendedAny) break;
    }
  }
}
