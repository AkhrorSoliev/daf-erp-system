import { Injectable } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveCallerReportBranchIds } from '../common/finance/report-branch-scope';
import {
  tashkentDateStr,
  tashkentDayRangeUtc,
  utcMidnightFromDateStr,
} from '../attendance/shared/date-utils';
import { AbsenceStreakService } from './absence-streak.service';

interface UserContext {
  userId: number;
  companyId: number;
  roles: string[];
}

@Injectable()
export class OutreachService {
  constructor(
    private prisma: PrismaService,
    private absenceStreak: AbsenceStreakService,
  ) {}

  // CEO spans every branch; everyone else — Administrator included — is confined
  // to the branches attached to them, and a caller with none sees nothing.
  // Administrator used to be exempt alongside CEO, which contradicted D4/D6.
  private async resolveBranchScope(
    userId: number,
    _roles: string[],
  ): Promise<number[] | undefined> {
    const ids = await resolveCallerReportBranchIds(this.prisma, userId);
    return ids ?? undefined;
  }

  async getTodayAbsentees(ctx: UserContext & { date?: string }) {
    // Defaults to Tashkent calendar today when caller omits the date — keeps
    // backward compatibility with the no-arg endpoint.
    const dateStr = ctx.date ?? tashkentDateStr(new Date());
    const date = utcMidnightFromDateStr(dateStr);
    const branchIds = await this.resolveBranchScope(ctx.userId, ctx.roles);
    // Empty array means "no branches assigned" — return nothing instead of
    // matching every branch via Prisma's missing-filter shortcut.
    if (branchIds && branchIds.length === 0) {
      return { date: dateStr, total: 0, items: [] };
    }

    const rows = await this.prisma.attendance.findMany({
      where: {
        date,
        status: AttendanceStatus.ABSENT,
        companyId: ctx.companyId,
        group: {
          deletedAt: null,
          ...(branchIds ? { branchId: { in: branchIds } } : {}),
        },
        student: { deletedAt: null },
      },
      select: {
        id: true,
        note: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            photo: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            lessonStartTime: true,
            lessonEndTime: true,
            course: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
            teachers: {
              select: {
                teacher: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });

    // "Bog'lanildi" badge — was this student already called (any reason) on the
    // viewed date? Lets the admin skip students they've already worked through.
    const calledSet = await this.getCalledStudentIds(
      ctx.companyId,
      rows.map((r) => r.student.id),
      dateStr,
    );

    const items = rows.map((r) => ({
      attendanceId: r.id,
      note: r.note,
      calledToday: calledSet.has(r.student.id),
      student: r.student,
      group: {
        id: r.group.id,
        name: r.group.name,
        lessonStartTime: r.group.lessonStartTime,
        lessonEndTime: r.group.lessonEndTime,
        course: r.group.course,
        branch: r.group.branch,
      },
      teacher: r.group.teachers[0]
        ? {
            id: r.group.teachers[0].teacher.id,
            firstName: r.group.teachers[0].teacher.firstName,
            lastName: r.group.teachers[0].teacher.lastName,
          }
        : null,
    }));

    // Sort: by lesson start time ASC so the user works through the day
    // chronologically (and groups with no time go last).
    items.sort((a, b) => {
      const at = a.group.lessonStartTime ?? '99:99';
      const bt = b.group.lessonStartTime ?? '99:99';
      return at.localeCompare(bt);
    });

    return { date: dateStr, total: items.length, items };
  }

  // Lightweight summary for the /outreach landing widget. Counts come from
  // cheap SQL aggregates; removalQueue reuses the same fan-out as
  // getRemovalQueue (acceptable because the page only fetches stats once).
  async getStats(ctx: UserContext) {
    const branchIds = await this.resolveBranchScope(ctx.userId, ctx.roles);
    if (branchIds && branchIds.length === 0) {
      return {
        todayAbsentees: 0,
        removalQueue: 0,
        activePromises: 0,
        callsToday: 0,
      };
    }

    const todayStr = tashkentDateStr(new Date());
    // Attendance.date is stored at UTC-midnight, so it uses the plain date.
    const today = utcMidnightFromDateStr(todayStr);

    const [todayAbsentees, streaks, activePromises, callsToday] =
      await Promise.all([
        this.prisma.attendance.count({
          where: {
            date: today,
            status: AttendanceStatus.ABSENT,
            companyId: ctx.companyId,
            group: {
              deletedAt: null,
              ...(branchIds ? { branchId: { in: branchIds } } : {}),
            },
            student: { deletedAt: null },
          },
        }),
        this.absenceStreak.computeStreaks({
          companyId: ctx.companyId,
          branchIds,
          threshold: 3,
        }),
        this.prisma.paymentPromise.count({
          where: {
            companyId: ctx.companyId,
            status: { in: ['OPEN', 'BROKEN'] },
            student: { balance: { lt: 0 }, deletedAt: null },
            ...(branchIds ? { branchId: { in: branchIds } } : {}),
          },
        }),
        this.prisma.callLog.count({
          where: {
            companyId: ctx.companyId,
            // createdAt is a real instant — bound by the Tashkent day, not UTC.
            createdAt: tashkentDayRangeUtc(todayStr),
            ...(branchIds ? { branchId: { in: branchIds } } : {}),
          },
        }),
      ]);

    return {
      todayAbsentees,
      removalQueue: streaks.length,
      activePromises,
      callsToday,
    };
  }

  /**
   * Branch-scoped list of ACTIVE payment promises (OPEN + BROKEN) whose student
   * still owes — so a date set from the debtors page shows up here immediately,
   * not only after the cron flips it to BROKEN. `isOverdue` marks promises whose
   * date has passed. Overdue first, then by promise date ascending.
   */
  async getActivePromises(ctx: UserContext) {
    const branchIds = await this.resolveBranchScope(ctx.userId, ctx.roles);
    if (branchIds && branchIds.length === 0) return { total: 0, items: [] };

    const promises = await this.prisma.paymentPromise.findMany({
      where: {
        companyId: ctx.companyId,
        status: { in: ['OPEN', 'BROKEN'] },
        student: { balance: { lt: 0 }, deletedAt: null },
        ...(branchIds ? { branchId: { in: branchIds } } : {}),
      },
      select: {
        id: true,
        promiseDate: true,
        comment: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            parentPhone: true,
            photo: true,
            balance: true,
            enrollments: {
              where: { status: 'ACTIVE', deletedAt: null },
              select: { group: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { promiseDate: 'asc' },
    });

    const now = Date.now();
    const items = promises
      .map((p) => ({
        promiseId: p.id,
        promiseDate: p.promiseDate.toISOString(),
        isOverdue: p.promiseDate.getTime() < now,
        comment: p.comment,
        createdAt: p.createdAt.toISOString(),
        student: {
          id: p.student.id,
          firstName: p.student.firstName,
          lastName: p.student.lastName,
          phone: p.student.phone,
          parentPhone: p.student.parentPhone,
          photo: p.student.photo,
          balance: p.student.balance,
        },
        groups: p.student.enrollments.map((e) => e.group),
      }))
      // Overdue first; the findMany already ordered by promiseDate asc, so a
      // stable partition keeps each bucket in date order.
      .sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue));

    return { total: items.length, items };
  }

  async getRemovalQueue(ctx: UserContext) {
    const branchIds = await this.resolveBranchScope(ctx.userId, ctx.roles);
    if (branchIds && branchIds.length === 0) {
      return { total: 0, items: [] };
    }

    const streaks = await this.absenceStreak.computeStreaks({
      companyId: ctx.companyId,
      branchIds,
      threshold: 3,
    });

    if (streaks.length === 0) return { total: 0, items: [] };

    const enrollmentIds = streaks.map((s) => s.enrollmentId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: {
        id: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            parentPhone: true,
            photo: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            course: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
            teachers: {
              select: {
                teacher: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });
    const enrollMap = new Map(enrollments.map((e) => [e.id, e] as const));

    // "Bog'lanildi" badge — students already called today (any reason).
    const calledSet = await this.getCalledStudentIds(
      ctx.companyId,
      enrollments.map((e) => e.student.id),
      tashkentDateStr(new Date()),
    );

    const items = streaks
      .map((s) => {
        const e = enrollMap.get(s.enrollmentId);
        if (!e) return null;
        return {
          enrollmentId: s.enrollmentId,
          consecutiveAbsentCount: s.consecutiveAbsentCount,
          lastAbsenceDate: s.lastAbsenceDate.toISOString(),
          lastPresentDate: s.lastPresentDate?.toISOString() ?? null,
          calledToday: calledSet.has(e.student.id),
          student: e.student,
          group: {
            id: e.group.id,
            name: e.group.name,
            course: e.group.course,
            branch: e.group.branch,
          },
          teacher: e.group.teachers[0]
            ? {
                id: e.group.teachers[0].teacher.id,
                firstName: e.group.teachers[0].teacher.firstName,
                lastName: e.group.teachers[0].teacher.lastName,
              }
            : null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.consecutiveAbsentCount - a.consecutiveAbsentCount);

    return { total: items.length, items };
  }

  // Set of student IDs called (any reason) on the given Tashkent day — powers
  // the "Bog'lanildi" badge on the absentees / removal lists. Returns empty for
  // an empty input to avoid a needless `IN ()` query.
  private async getCalledStudentIds(
    companyId: number,
    studentIds: number[],
    dateStr: string,
  ): Promise<Set<number>> {
    if (studentIds.length === 0) return new Set();
    const rows = await this.prisma.callLog.findMany({
      where: {
        companyId,
        studentId: { in: studentIds },
        // createdAt is a real instant — bound by the Tashkent day, not UTC.
        createdAt: tashkentDayRangeUtc(dateStr),
      },
      select: { studentId: true },
    });
    return new Set(rows.map((r) => r.studentId));
  }
}
