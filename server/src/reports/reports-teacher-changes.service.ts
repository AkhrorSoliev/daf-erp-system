import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildDepartedEnrollmentWhere } from './shared/departed-filter';
import { equalsOrIn } from '../common/dto/to-array';

@Injectable()
export class ReportsTeacherChangesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Drill-down: davr ichidagi barcha ustoz almashish hodisalari.
   */
  async getTeacherChangesList(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string[];
      teacherIds?: number[];
      startDate: string;
      endDate: string;
      reasonId?: string;
    },
  ) {
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    end.setHours(23, 59, 59, 999);

    const groupFilter: any = { companyId, deletedAt: null };
    if (params.branchId !== undefined) groupFilter.branchId = params.branchId;
    if (params.courseId?.length)
      groupFilter.courseId = equalsOrIn(params.courseId);
    if (params.teacherIds && params.teacherIds.length > 0) {
      groupFilter.teachers = {
        some: { teacherId: { in: params.teacherIds } },
      };
    }

    const where: any = {
      createdAt: { gte: start, lte: end },
      group: groupFilter,
    };
    if (params.reasonId !== undefined) {
      where.changeReasonId =
        params.reasonId === 'null' ? null : params.reasonId;
    }

    const changes = await this.prisma.groupTeacherHistory.findMany({
      where,
      select: {
        id: true,
        groupId: true,
        previousTeacherIds: true,
        newTeacherIds: true,
        changeType: true,
        triggeredByDismissal: true,
        changeReasonId: true,
        createdAt: true,
        group: {
          select: {
            id: true,
            name: true,
            branch: { select: { id: true, name: true } },
            course: { select: { id: true, name: true } },
          },
        },
        changedBy: { select: { id: true, firstName: true, lastName: true } },
        changeReasonRef: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const teacherIds = Array.from(
      new Set(
        changes.flatMap((c) => [...c.previousTeacherIds, ...c.newTeacherIds]),
      ),
    );
    const teachers = teacherIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const teacherMap = new Map(
      teachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`]),
    );

    return changes.map((c) => ({
      id: c.id,
      groupId: c.groupId,
      groupName: c.group.name,
      branchName: c.group.branch.name,
      courseName: c.group.course.name,
      previousTeachers: c.previousTeacherIds.map(
        (id) => teacherMap.get(id) ?? `#${id}`,
      ),
      newTeachers: c.newTeacherIds.map((id) => teacherMap.get(id) ?? `#${id}`),
      changeType: c.changeType,
      triggeredByDismissal: c.triggeredByDismissal,
      reasonId: c.changeReasonRef?.id ?? null,
      reasonName: c.changeReasonRef?.name ?? null,
      changedAt: c.createdAt,
      changedBy: c.changedBy
        ? `${c.changedBy.firstName} ${c.changedBy.lastName}`
        : null,
    }));
  }

  /**
   * Drill-down: transferred enrollments, optionally filtered by transferReasonId.
   * Drives the "Transfer sabablari" chart's drill-down dialog.
   */
  async getTransferredList(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string[];
      teacherIds?: number[];
      startDate: string;
      endDate: string;
      page?: number;
      pageSize?: number;
      transferReasonId?: string;
    },
  ) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10));
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    end.setHours(23, 59, 59, 999);

    const where: any = {
      ...buildDepartedEnrollmentWhere(companyId, params),
      status: 'TRANSFERRED' as const,
      statusChangedAt: { gte: start, lte: end },
    };
    if (params.transferReasonId !== undefined) {
      where.transferReasonId =
        params.transferReasonId === 'null' ? null : params.transferReasonId;
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        orderBy: { statusChangedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          statusChangedAt: true,
          transferredToId: true,
          transferReasonId: true,
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
          group: {
            select: {
              id: true,
              name: true,
              branch: { select: { id: true, name: true } },
              course: { select: { id: true, name: true } },
            },
          },
          transferReason: { select: { id: true, name: true } },
        },
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    const targetIds = Array.from(
      new Set(rows.map((r) => r.transferredToId).filter(Boolean) as string[]),
    );
    const targets = targetIds.length
      ? await this.prisma.group.findMany({
          where: { id: { in: targetIds } },
          select: { id: true, name: true },
        })
      : [];
    const targetMap = new Map(targets.map((g) => [g.id, g.name]));

    const data = rows.map((r) => ({
      id: r.id,
      student: {
        id: r.student.id,
        fullName: `${r.student.firstName} ${r.student.lastName}`,
      },
      fromGroup: r.group ? { id: r.group.id, name: r.group.name } : null,
      toGroup: r.transferredToId
        ? {
            id: r.transferredToId,
            name: targetMap.get(r.transferredToId) ?? '—',
          }
        : null,
      branch: r.group?.branch ?? null,
      course: r.group?.course ?? null,
      transferredAt: r.statusChangedAt?.toISOString() ?? null,
      reason: r.transferReason
        ? { id: r.transferReason.id, name: r.transferReason.name }
        : null,
    }));

    return { data, total, page, pageSize };
  }

  /**
   * Drill-down for the teacher-change retention card: students who "left"
   * within 5 lessons of a teacher change — where "left" means the enrollment
   * went DROPPED (guruhsiz qoldi) or FROZEN (muzlatildi). Date-ranged; mirrors
   * getTeacherChangeRetentionMetrics.
   */
  async getDepartedAfterTeacherChangeList(
    companyId: number,
    params: { branchId?: number; startDate: string; endDate: string },
  ) {
    const LESSON_WINDOW = 5;

    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    end.setHours(23, 59, 59, 999);

    const groupFilter: any = { companyId, deletedAt: null };
    if (params.branchId !== undefined) groupFilter.branchId = params.branchId;

    const changes = await this.prisma.groupTeacherHistory.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        group: groupFilter,
      },
      select: {
        id: true,
        groupId: true,
        previousTeacherIds: true,
        newTeacherIds: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (changes.length === 0) return [];

    type Row = {
      enrollmentId: string;
      studentId: number;
      studentName: string;
      groupId: string;
      groupName: string;
      branchName: string;
      teacherChangeAt: Date;
      departedAt: Date;
      departureStatus: 'DROPPED' | 'FROZEN';
      lessonNumber: number;
      previousTeachers: string[];
      newTeachers: string[];
      departureReason: string | null;
    };

    const seen = new Set<string>();
    const rows: Row[] = [];

    const teacherIdsAll = Array.from(
      new Set(
        changes.flatMap((c) => [...c.previousTeacherIds, ...c.newTeacherIds]),
      ),
    );
    const teachers = teacherIdsAll.length
      ? await this.prisma.user.findMany({
          where: { id: { in: teacherIdsAll } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const teacherMap = new Map(
      teachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`]),
    );

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
        select: {
          id: true,
          studentId: true,
          status: true,
          statusChangedAt: true,
          student: { select: { firstName: true, lastName: true } },
          group: {
            select: {
              name: true,
              branch: { select: { name: true } },
            },
          },
          departureReason: { select: { name: true } },
        },
      });

      for (const e of departed) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);

        const departedAt = e.statusChangedAt!;
        const lessonNumber =
          lessonDates.findIndex(
            (l) => l.date.getTime() >= departedAt.getTime(),
          ) + 1 || lessonDates.length;

        rows.push({
          enrollmentId: e.id,
          studentId: e.studentId,
          studentName: `${e.student.firstName} ${e.student.lastName}`,
          groupId: change.groupId,
          groupName: e.group.name,
          branchName: e.group.branch.name,
          teacherChangeAt: change.createdAt,
          departedAt,
          departureStatus: e.status as 'DROPPED' | 'FROZEN',
          lessonNumber,
          previousTeachers: change.previousTeacherIds.map(
            (id) => teacherMap.get(id) ?? `#${id}`,
          ),
          newTeachers: change.newTeacherIds.map(
            (id) => teacherMap.get(id) ?? `#${id}`,
          ),
          departureReason: e.departureReason?.name ?? null,
        });
      }
    }

    rows.sort((a, b) => b.departedAt.getTime() - a.departedAt.getTime());
    return rows;
  }
}
