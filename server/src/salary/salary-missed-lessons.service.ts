import { Injectable } from '@nestjs/common';
import {
  GroupStatus,
  MonthlyChargeStatus,
  PlannedAbsenceKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  addDaysToDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { resolveMonthPlan } from '../billing/month-plan';
import { lessonDatesInMonth } from '../billing/planned-lessons';
import type { RateVersion } from './shared/deserved-math';
import {
  computeMissedLessons,
  MISSED_LESSONS_START_DAY,
  type MissedLessonGroup,
  type MissedLessonsResult,
} from './shared/missed-lessons';

/**
 * Loads what `computeMissedLessons` needs for one teacher and one month.
 * Only lessons dated before today count: today's lesson may still be taken.
 */
@Injectable()
export class SalaryMissedLessonsService {
  constructor(private prisma: PrismaService) {}

  async forTeacher(
    teacherId: number,
    companyId: number,
    /** 'YYYY-MM'. */
    month: string,
    now: Date = new Date(),
  ): Promise<MissedLessonsResult> {
    const empty: MissedLessonsResult = { lessons: [], total: 0 };
    const year = Number(month.slice(0, 4));
    const mon = Number(month.slice(5, 7));
    const monthStart = `${month}-01`;
    const monthEnd = tashkentDateStr(
      new Date(Date.UTC(year, mon, 0, 12)), // noon: stays on that UTC day in Tashkent
    );
    const from =
      monthStart > MISSED_LESSONS_START_DAY
        ? monthStart
        : MISSED_LESSONS_START_DAY;
    const yesterday = addDaysToDateStr(tashkentDateStr(now), -1);
    const to = yesterday < monthEnd ? yesterday : monthEnd;
    if (from > to) return empty;

    const links = await this.prisma.groupTeacher.findMany({
      where: { teacherId },
      select: { groupId: true },
    });
    if (links.length === 0) return empty;

    const groups = await this.prisma.group.findMany({
      where: {
        id: { in: links.map((l) => l.groupId) },
        companyId,
        deletedAt: null,
        statusEnum: { in: [GroupStatus.ACTIVE, GroupStatus.COMPLETED] },
      },
      select: {
        id: true,
        name: true,
        branchId: true,
        exactDays: true,
        startDate: true,
        endDate: true,
      },
    });
    if (groups.length === 0) return empty;
    const groupIds = groups.map((g) => g.id);

    const planned: MissedLessonGroup[] = [];
    for (const g of groups) {
      const start = g.startDate ? tashkentDateStr(g.startDate) : null;
      const end = g.endDate ? tashkentDateStr(g.endDate) : null;
      const fromDate = start && start > from ? start : from;
      const toDate = end && end < to ? end : to;
      if (fromDate > toDate) continue;
      const { excludedDates, addedDates } = await resolveMonthPlan(
        this.prisma,
        g.id,
        g.branchId,
        year,
        mon,
      );
      const plannedDates = lessonDatesInMonth({
        year,
        month: mon,
        exactDays: g.exactDays,
        excludedDates,
        addedDates,
        fromDate,
        toDate,
      });
      if (plannedDates.length > 0) {
        planned.push({ id: g.id, name: g.name, plannedDates });
      }
    }
    if (planned.length === 0) return empty;

    const dateRange = {
      gte: utcMidnightFromDateStr(from),
      lt: utcMidnightFromDateStr(addDaysToDateStr(to, 1)),
    };
    const [taken, overrides, charges, excused, versionRows] = await Promise.all(
      [
        this.prisma.attendance.groupBy({
          by: ['groupId', 'date'],
          where: { groupId: { in: groupIds }, date: dateRange },
        }),
        this.prisma.lessonTeacherOverride.findMany({
          where: {
            groupId: { in: groupIds },
            deletedAt: null,
            date: dateRange,
          },
          select: { groupId: true, date: true, teacherIds: true },
        }),
        this.prisma.enrollmentMonthlyCharge.findMany({
          where: {
            groupId: { in: groupIds },
            periodYear: year,
            periodMonth: mon,
            status: MonthlyChargeStatus.CHARGED,
          },
          select: {
            groupId: true,
            studentId: true,
            coveredDates: true,
            frozenOutDates: true,
            perLessonCost: true,
            plannedLessons: true,
          },
        }),
        this.prisma.plannedAbsence.findMany({
          where: {
            groupId: { in: groupIds },
            kind: PlannedAbsenceKind.SABABLI,
            date: dateRange,
          },
          select: { groupId: true, studentId: true, date: true },
        }),
        this.prisma.employeeSalaryConfigVersion.findMany({
          where: { companyId, config: { userId: teacherId, isActive: true } },
          select: {
            salaryType: true,
            value: true,
            effectiveFrom: true,
            effectiveTo: true,
            config: { select: { groupId: true } },
          },
        }),
      ],
    );

    const byGroup = new Map<string, RateVersion[]>();
    const global: RateVersion[] = [];
    for (const v of versionRows) {
      const rate: RateVersion = {
        salaryType: v.salaryType,
        value: v.value,
        effectiveFrom: v.effectiveFrom,
        effectiveTo: v.effectiveTo,
      };
      if (v.config.groupId == null) {
        global.push(rate);
      } else {
        const arr = byGroup.get(v.config.groupId) ?? [];
        arr.push(rate);
        byGroup.set(v.config.groupId, arr);
      }
    }

    // `@db.Date` columns come back as UTC midnight: the ISO date is the day.
    const day = (d: Date) => d.toISOString().slice(0, 10);
    return computeMissedLessons({
      teacherId,
      groups: planned,
      // TODO(integration §4.7): a lesson whose pay was forfeited (a non-exempt
      // «Dars bo'ldimi?» row) is not «taken»; an exempt one is (ADR-0054).
      takenLessons: new Set(taken.map((t) => `${t.groupId}::${day(t.date)}`)),
      overrides: new Map(
        overrides.map((o) => [`${o.groupId}::${day(o.date)}`, o.teacherIds]),
      ),
      charges,
      excused: new Set(
        excused.map((e) => `${e.groupId}::${e.studentId}::${day(e.date)}`),
      ),
      rateVersions: { byGroup, global },
    });
  }
}
