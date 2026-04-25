import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildDepartedEnrollmentWhere } from './shared/departed-filter';

@Injectable()
export class ReportsDepartedStudentsService {
  constructor(private prisma: PrismaService) {}

  async getDepartedStudentsSummary(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
    },
  ) {
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    end.setHours(23, 59, 59, 999);

    const groupFilter: any = {};
    if (params.branchId !== undefined) groupFilter.branchId = params.branchId;
    if (params.courseId) groupFilter.courseId = params.courseId;
    if (params.teacherIds && params.teacherIds.length > 0) {
      groupFilter.teachers = {
        some: { teacherId: { in: params.teacherIds } },
      };
    }
    const baseWhere: any = {
      deletedAt: null,
      student: { companyId, deletedAt: null },
    };
    if (Object.keys(groupFilter).length > 0) {
      baseWhere.group = groupFilter;
    }

    const dropped = await this.prisma.enrollment.findMany({
      where: {
        ...baseWhere,
        status: 'DROPPED',
        statusChangedAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        createdAt: true,
        statusChangedAt: true,
      },
    });

    // Enrollments that were still "alive" (ACTIVE or FROZEN) at the start of
    // the period. These form the churn-rate denominator.
    //
    // An enrollment counts if:
    //   - it was created before `start` (existed at that moment), AND
    //   - it was not already terminated (DROPPED/COMPLETED/TRANSFERRED) by `start`
    //
    // We approximate the second condition as:
    //   - current status is ACTIVE or FROZEN (so it hasn't been terminated yet), OR
    //   - current status is terminated but the transition happened after `start`
    //     (meaning it was still alive at `start`).
    //
    // Note: without StatusHistory we cannot distinguish FROZEN->ACTIVE mid-period
    // transitions; this is a known minor approximation.
    const activeAtStart = await this.prisma.enrollment.count({
      where: {
        ...baseWhere,
        createdAt: { lt: start },
        OR: [
          { status: { in: ['ACTIVE', 'FROZEN'] } },
          { statusChangedAt: { gte: start } },
        ],
      },
    });

    const departedCount = dropped.length;
    const churnRate =
      activeAtStart > 0 ? (departedCount / activeAtStart) * 100 : 0;

    // Lost revenue: for each dropped enrollment, find the contract that was
    // most likely "in effect" at the time of departure (latest contract whose
    // createdAt <= the enrollment's departure date) and sum the unpaid
    // remainder. Cancelled/refunded contracts are excluded — they're not lost
    // revenue, they've been explicitly closed out.
    let lostRevenue = 0;
    if (dropped.length > 0) {
      const studentIds = Array.from(new Set(dropped.map((d) => d.studentId)));
      const groupIds = Array.from(new Set(dropped.map((d) => d.groupId)));
      const contracts = await this.prisma.contract.findMany({
        where: {
          companyId,
          deletedAt: null,
          studentId: { in: studentIds },
          groupId: { in: groupIds },
          status: { notIn: ['CANCELLED', 'REFUNDED'] },
        },
        select: {
          studentId: true,
          groupId: true,
          totalAmount: true,
          paidAmount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const byKey = new Map<
        string,
        {
          totalAmount: number;
          paidAmount: number;
          createdAt: Date;
        }[]
      >();
      for (const c of contracts) {
        const key = `${c.studentId}:${c.groupId}`;
        const list = byKey.get(key);
        if (list) list.push(c);
        else byKey.set(key, [c]);
      }

      for (const d of dropped) {
        const key = `${d.studentId}:${d.groupId}`;
        const list = byKey.get(key);
        if (!list) continue;
        const departureAt = d.statusChangedAt ?? d.createdAt;
        // Pick the latest contract created on or before the departure. If none
        // is old enough, fall back to the oldest available contract.
        const contract =
          list.find((c) => c.createdAt.getTime() <= departureAt.getTime()) ??
          list[list.length - 1];
        const unpaid = contract.totalAmount - contract.paidAmount;
        if (unpaid > 0) lostRevenue += unpaid;
      }
    }

    const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;
    let avgDurationMonths = 0;
    if (dropped.length > 0) {
      const totalMs = dropped.reduce((sum, d) => {
        const end = d.statusChangedAt ?? d.createdAt;
        return sum + (end.getTime() - d.createdAt.getTime());
      }, 0);
      avgDurationMonths = totalMs / dropped.length / MS_PER_MONTH;
    }

    const { totalTeacherChanges, departedAfterTeacherChange } =
      await this.getTeacherChangeRetentionMetrics(companyId, {
        start,
        end,
        groupFilter,
      });

    return {
      churnRate: Math.round(churnRate * 10) / 10,
      departedCount,
      activeAtStart,
      lostRevenue,
      avgDurationMonths: Math.round(avgDurationMonths * 10) / 10,
      totalTeacherChanges,
      departedAfterTeacherChange,
    };
  }

  /**
   * Tanlangan davrda ustoz almashishlari va o'sha o'zgarishdan keyin
   * guruhning 5 ta dars ichida ketgan o'quvchilar sonini hisoblaydi.
   *
   * 5-dars sanasi `Attendance` jadvalidagi noyob sanalardan olinadi
   * (tizimda alohida Lesson modeli yo'q).
   */
  private async getTeacherChangeRetentionMetrics(
    companyId: number,
    params: { start: Date; end: Date; groupFilter: any },
  ) {
    const { start, end, groupFilter } = params;
    const LESSON_WINDOW = 5;

    const changes = await this.prisma.groupTeacherHistory.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        group: {
          companyId,
          deletedAt: null,
          ...groupFilter,
        },
      },
      select: {
        id: true,
        groupId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (changes.length === 0) {
      return { totalTeacherChanges: 0, departedAfterTeacherChange: 0 };
    }

    const affectedEnrollmentIds = new Set<string>();

    for (const change of changes) {
      const lessonDates = await this.prisma.attendance.findMany({
        where: {
          groupId: change.groupId,
          date: { gte: change.createdAt },
        },
        distinct: ['date'],
        select: { date: true },
        orderBy: { date: 'asc' },
        take: LESSON_WINDOW,
      });

      if (lessonDates.length === 0) continue;

      const cutoffDate = lessonDates[lessonDates.length - 1].date;

      const departed = await this.prisma.enrollment.findMany({
        where: {
          groupId: change.groupId,
          status: 'DROPPED',
          deletedAt: null,
          createdAt: { lt: change.createdAt },
          statusChangedAt: { gte: change.createdAt, lte: cutoffDate },
          student: { companyId, deletedAt: null },
        },
        select: { id: true },
      });

      for (const e of departed) affectedEnrollmentIds.add(e.id);
    }

    return {
      totalTeacherChanges: changes.length,
      departedAfterTeacherChange: affectedEnrollmentIds.size,
    };
  }

  async getDepartedStudentsDynamics(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
    },
  ) {
    // Format date in Asia/Tashkent (UTC+5) regardless of server timezone.
    // `en-CA` locale gives ISO-like yyyy-MM-dd.
    const TZ = 'Asia/Tashkent';
    const fmtDay = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);

    const start = new Date(params.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(params.endDate);
    end.setHours(23, 59, 59, 999);

    const rangeMs = end.getTime() - start.getTime();
    const rangeDays = Math.ceil(rangeMs / (1000 * 60 * 60 * 24));
    // Choose bucket size so the chart always has ~10–45 bars.
    //   <= 45 days  → daily
    //   <= 6 months → weekly (7-day buckets starting from Monday)
    //   otherwise   → monthly
    const granularity: 'day' | 'week' | 'month' =
      rangeDays <= 45 ? 'day' : rangeDays <= 186 ? 'week' : 'month';

    const rows = await this.prisma.enrollment.findMany({
      where: {
        ...buildDepartedEnrollmentWhere(companyId, params),
        status: 'DROPPED',
        statusChangedAt: { gte: start, lte: end },
      },
      select: { statusChangedAt: true },
    });

    const bucketKey = (d: Date): string => {
      if (granularity === 'day') return fmtDay(d);
      if (granularity === 'month') {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: TZ,
          year: 'numeric',
          month: '2-digit',
        }).format(d);
        return `${parts}-01`;
      }
      const dayStr = fmtDay(d);
      const [y, m, day] = dayStr.split('-').map(Number);
      const tzDate = new Date(Date.UTC(y, m - 1, day));
      const dayOfWeek = (tzDate.getUTCDay() + 6) % 7;
      tzDate.setUTCDate(tzDate.getUTCDate() - dayOfWeek);
      return tzDate.toISOString().slice(0, 10);
    };

    const addDays = (d: Date, n: number): Date => {
      const next = new Date(d);
      next.setDate(next.getDate() + n);
      return next;
    };
    const addMonths = (d: Date, n: number): Date => {
      const next = new Date(d);
      next.setMonth(next.getMonth() + n);
      return next;
    };

    const countByBucket = new Map<string, number>();
    for (const r of rows) {
      if (!r.statusChangedAt) continue;
      const key = bucketKey(r.statusChangedAt);
      countByBucket.set(key, (countByBucket.get(key) ?? 0) + 1);
    }

    const data: { date: string; count: number }[] = [];
    let cursor: Date;
    if (granularity === 'day') {
      cursor = new Date(start);
    } else if (granularity === 'month') {
      cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    } else {
      const dayOfWeek = (start.getDay() + 6) % 7;
      cursor = addDays(start, -dayOfWeek);
    }
    let safety = 0;
    while (cursor.getTime() <= end.getTime() && safety++ < 500) {
      const key = bucketKey(cursor);
      data.push({ date: key, count: countByBucket.get(key) ?? 0 });
      cursor =
        granularity === 'day'
          ? addDays(cursor, 1)
          : granularity === 'week'
            ? addDays(cursor, 7)
            : addMonths(cursor, 1);
    }

    return { data, granularity };
  }

}
