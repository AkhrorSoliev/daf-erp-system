import { Injectable } from '@nestjs/common';
import { AssigneeStatus, AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../attendance/shared/date-utils';
import { AbsenceStreakService } from './absence-streak.service';
import { CallbacksQueryDto } from './dto/callbacks-query.dto';

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

  // Branch Director sees only their own branch. CEO/Administrator see all
  // branches in the company. JWT does not carry mainBranch — fetch it.
  private async resolveBranchScope(
    userId: number,
    roles: string[],
  ): Promise<number[] | undefined> {
    const isCeo = roles.includes('CEO');
    const isAdmin = roles.includes('Administrator');
    const isBd = roles.includes('Branch Director');
    if (isCeo || isAdmin) return undefined;
    if (!isBd) return [];

    const caller = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mainBranch: true },
    });
    return caller?.mainBranch ? [caller.mainBranch] : [];
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

    const items = rows.map((r) => ({
      attendanceId: r.id,
      note: r.note,
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

  async getMyCallbacks(params: {
    userId: number;
    companyId: number;
    query: CallbacksQueryDto;
  }) {
    const page = params.query.page ?? 1;
    const pageSize = params.query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const statuses = (params.query.status ?? 'PENDING,SEEN')
      .split(',')
      .map((s) => s.trim() as AssigneeStatus);

    const where = {
      userId: params.userId,
      status: { in: statuses },
      comment: {
        isTask: true,
        dueDate: { not: null },
        companyId: params.companyId,
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.commentAssignee.findMany({
        where,
        include: {
          comment: {
            include: {
              author: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
        orderBy: { comment: { dueDate: 'asc' } },
        skip,
        take: pageSize,
      }),
      this.prisma.commentAssignee.count({ where }),
    ]);

    // Bulk-load referenced Lead / Student entities. We resolve entityId →
    // entity in two batched queries instead of fan-out-per-row.
    const leadIds = new Set<string>();
    const studentIds = new Set<number>();
    for (const r of rows) {
      if (r.comment.entityType === 'Lead') {
        leadIds.add(r.comment.entityId);
      } else if (r.comment.entityType === 'Student') {
        const id = Number(r.comment.entityId);
        if (!Number.isNaN(id)) studentIds.add(id);
      }
    }
    const [leads, students] = await Promise.all([
      leadIds.size > 0
        ? this.prisma.lead.findMany({
            where: { id: { in: [...leadIds] } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          })
        : Promise.resolve([]),
      studentIds.size > 0
        ? this.prisma.student.findMany({
            where: { id: { in: [...studentIds] } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              photo: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const leadMap = new Map(leads.map((l) => [l.id, l] as const));
    const studentMap = new Map(students.map((s) => [s.id, s] as const));

    const now = Date.now();
    const items = rows.map((r) => {
      const dueAt = r.comment.dueDate!.getTime();
      const entity =
        r.comment.entityType === 'Lead'
          ? (leadMap.get(r.comment.entityId) ?? null)
          : r.comment.entityType === 'Student'
            ? (studentMap.get(Number(r.comment.entityId)) ?? null)
            : null;
      return {
        commentId: r.comment.id,
        assigneeStatus: r.status,
        dueDate: r.comment.dueDate!.toISOString(),
        isOverdue: dueAt < now,
        priority: r.comment.priority,
        text: r.comment.content,
        entityType: r.comment.entityType,
        entityId: r.comment.entityId,
        entity,
        author: r.comment.author,
      };
    });

    return { total, page, pageSize, items };
  }

  // Lightweight summary for the /outreach landing widget. Three counts come
  // from cheap SQL aggregates; removalQueueCount reuses the same fan-out as
  // getRemovalQueue (acceptable because the page only fetches stats once).
  async getStats(ctx: UserContext) {
    const branchIds = await this.resolveBranchScope(ctx.userId, ctx.roles);
    if (branchIds && branchIds.length === 0) {
      return {
        todayAbsentees: 0,
        pendingCallbacks: 0,
        overdueCallbacks: 0,
        removalQueue: 0,
        overduePromises: 0,
      };
    }

    const todayStr = tashkentDateStr(new Date());
    const today = utcMidnightFromDateStr(todayStr);
    const now = new Date();

    const [
      todayAbsentees,
      pendingCallbacks,
      overdueCallbacks,
      streaks,
      overduePromises,
    ] = await Promise.all([
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
        this.prisma.commentAssignee.count({
          where: {
            userId: ctx.userId,
            status: { in: ['PENDING', 'SEEN'] },
            comment: {
              isTask: true,
              dueDate: { not: null },
              companyId: ctx.companyId,
            },
          },
        }),
        this.prisma.commentAssignee.count({
          where: {
            userId: ctx.userId,
            status: { in: ['PENDING', 'SEEN'] },
            comment: {
              isTask: true,
              dueDate: { lt: now },
              companyId: ctx.companyId,
            },
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
            status: 'BROKEN',
            student: { balance: { lt: 0 }, deletedAt: null },
            ...(branchIds ? { branchId: { in: branchIds } } : {}),
          },
        }),
      ]);

    return {
      todayAbsentees,
      pendingCallbacks,
      overdueCallbacks,
      removalQueue: streaks.length,
      overduePromises,
    };
  }

  /**
   * Branch-scoped list of broken payment promises whose student still owes.
   * Mirrors getRemovalQueue's shape so the /outreach "To'lov va'dalari" tab
   * reuses the same row/link patterns. Oldest broken promise first.
   */
  async getOverduePromises(ctx: UserContext) {
    const branchIds = await this.resolveBranchScope(ctx.userId, ctx.roles);
    if (branchIds && branchIds.length === 0) return { total: 0, items: [] };

    const promises = await this.prisma.paymentPromise.findMany({
      where: {
        companyId: ctx.companyId,
        status: 'BROKEN',
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

    const items = promises.map((p) => ({
      promiseId: p.id,
      promiseDate: p.promiseDate.toISOString(),
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
    }));

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

    const items = streaks
      .map((s) => {
        const e = enrollMap.get(s.enrollmentId);
        if (!e) return null;
        return {
          enrollmentId: s.enrollmentId,
          consecutiveAbsentCount: s.consecutiveAbsentCount,
          lastAbsenceDate: s.lastAbsenceDate.toISOString(),
          lastPresentDate: s.lastPresentDate?.toISOString() ?? null,
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
}
