import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { loadDepartedStudents } from './shared/departed-students-dataset';

@Injectable()
export class ReportsDepartedStudentsService {
  constructor(private prisma: PrismaService) {}

  /**
   * KPI cards for the "Ketgan o'quvchilar" page.
   *
   * The departed-count / churn / lost-revenue / avg-duration figures are built
   * from the student-level snapshot (loadDepartedStudents) — current-state,
   * date-range-independent — so they reconcile with the list and the charts.
   *
   * The teacher-change retention figures are event analytics: they DO honour
   * the `startDate`/`endDate` range, like the teacher-change / transfer charts.
   */
  async getDepartedStudentsSummary(
    companyId: number,
    params: { branchId?: number; startDate: string; endDate: string },
  ) {
    const departed = await loadDepartedStudents(this.prisma, companyId, {
      branchId: params.branchId,
    });
    const departedCount = departed.length;

    // Qarzdorlik — departed students whose balance is negative (they owe
    // money). totalDebt is a negative number (sum of those balances).
    const debtors = departed.filter((d) => d.balance < 0);
    const debtorCount = debtors.length;
    const totalDebt = debtors.reduce((sum, d) => sum + d.balance, 0);

    // Churn = departed share of all non-graduated students. The denominator
    // is departed + currently-studying (students with an ACTIVE enrollment).
    const studyingWhere: Prisma.StudentWhereInput = {
      companyId,
      deletedAt: null,
      enrollments: { some: { status: 'ACTIVE', deletedAt: null } },
    };
    if (params.branchId !== undefined) {
      studyingWhere.branches = { some: { branchId: params.branchId } };
    }
    const studyingCount = await this.prisma.student.count({
      where: studyingWhere,
    });
    const totalStudents = departedCount + studyingCount;
    const churnRate =
      totalStudents > 0 ? (departedCount / totalStudents) * 100 : 0;

    // Lost revenue + average study duration — both need per-student data, so
    // they run only when there is at least one departed student.
    let lostRevenue = 0;
    let avgDurationMonths = 0;
    if (departedCount > 0) {
      const studentIds = departed.map((d) => d.studentId);

      // Lost revenue: unpaid remainder of every still-open contract belonging
      // to a departed student. Cancelled/refunded contracts are excluded.
      const contracts = await this.prisma.contract.findMany({
        where: {
          companyId,
          deletedAt: null,
          studentId: { in: studentIds },
          status: { notIn: ['CANCELLED', 'REFUNDED'] },
        },
        select: { totalAmount: true, paidAmount: true },
      });
      for (const c of contracts) {
        const unpaid = c.totalAmount - c.paidAmount;
        if (unpaid > 0) lostRevenue += unpaid;
      }

      // Average study duration: leftAt − earliest enrollment createdAt.
      const firstEnrollments = await this.prisma.enrollment.groupBy({
        by: ['studentId'],
        where: { studentId: { in: studentIds }, deletedAt: null },
        _min: { createdAt: true },
      });
      const firstByStudent = new Map(
        firstEnrollments.map((e) => [e.studentId, e._min.createdAt]),
      );
      const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;
      let durationSum = 0;
      let durationCount = 0;
      for (const d of departed) {
        const first = firstByStudent.get(d.studentId);
        if (!first || !d.leftAt) continue;
        const ms = d.leftAt.getTime() - first.getTime();
        if (ms > 0) {
          durationSum += ms;
          durationCount += 1;
        }
      }
      avgDurationMonths =
        durationCount > 0 ? durationSum / durationCount / MS_PER_MONTH : 0;
    }

    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    end.setHours(23, 59, 59, 999);
    const { totalTeacherChanges, departedAfterTeacherChange } =
      await this.getTeacherChangeRetentionMetrics(companyId, {
        branchId: params.branchId,
        start,
        end,
      });

    return {
      churnRate: Math.round(churnRate * 10) / 10,
      departedCount,
      totalStudents,
      lostRevenue,
      totalDebt,
      debtorCount,
      avgDurationMonths: Math.round(avgDurationMonths * 10) / 10,
      totalTeacherChanges,
      departedAfterTeacherChange,
    };
  }

  /**
   * Counts teacher changes within the period and how many students "left"
   * within 5 lessons of one — where "left" means the enrollment went DROPPED
   * (guruhsiz qoldi) or FROZEN (muzlatildi).
   *
   * The 5th-lesson date is read from the distinct `Attendance` dates after
   * the change (the system has no separate Lesson model).
   */
  private async getTeacherChangeRetentionMetrics(
    companyId: number,
    params: { branchId?: number; start: Date; end: Date },
  ) {
    const LESSON_WINDOW = 5;

    const groupWhere: Prisma.GroupWhereInput = {
      companyId,
      deletedAt: null,
    };
    if (params.branchId !== undefined) groupWhere.branchId = params.branchId;

    const changes = await this.prisma.groupTeacherHistory.findMany({
      where: {
        createdAt: { gte: params.start, lte: params.end },
        group: groupWhere,
      },
      select: { id: true, groupId: true, createdAt: true },
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
          status: { in: ['DROPPED', 'FROZEN'] },
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

  /**
   * "Ketish dinamikasi" — how many of the currently-departed students lost
   * their group in each month. Buckets the student-level snapshot
   * (loadDepartedStudents) by `leftAt`, so the chart total reconciles with the
   * "Ketgan o'quvchilar" list instead of counting DROPPED enrollment events.
   */
  async getDepartedStudentsDynamics(
    companyId: number,
    params: { branchId?: number },
  ) {
    const TZ = 'Asia/Tashkent';
    // yyyy-MM-01 key for the month a date falls in (Tashkent time).
    const monthKey = (d: Date): string => {
      const ym = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
      }).format(d);
      return `${ym}-01`;
    };

    const departed = await loadDepartedStudents(this.prisma, companyId, {
      branchId: params.branchId,
    });

    const countByMonth = new Map<string, number>();
    for (const r of departed) {
      if (!r.leftAt) continue;
      const key = monthKey(r.leftAt);
      countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1);
    }

    if (countByMonth.size === 0) {
      return { data: [], granularity: 'month' as const };
    }

    // Emit every month from the earliest departure through the current month
    // so the line has no gaps.
    const sortedKeys = [...countByMonth.keys()].sort();
    const [firstYear, firstMonth] = sortedKeys[0].split('-').map(Number);
    const [nowYear, nowMonth] = monthKey(new Date()).split('-').map(Number);

    const data: { date: string; count: number }[] = [];
    let year = firstYear;
    let month = firstMonth;
    let safety = 0;
    while (
      (year < nowYear || (year === nowYear && month <= nowMonth)) &&
      safety++ < 240
    ) {
      const key = `${year}-${String(month).padStart(2, '0')}-01`;
      data.push({ date: key, count: countByMonth.get(key) ?? 0 });
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    return { data, granularity: 'month' as const };
  }
}
