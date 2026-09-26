import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildDepartedEnrollmentWhere } from './shared/departed-filter';
import { loadTeacherChangeDepartures } from './shared/teacher-change-departures';
import { equalsOrIn } from '../common/dto/to-array';
import { tashkentRangeUtc } from '../common/date/tashkent';

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
    // TIMESTAMP columns — the picked days are Tashkent days, and `end` is the
    // EXCLUSIVE start of the day after (see common/date/tashkent).
    const { gte: start, lt: end } = tashkentRangeUtc(
      params.startDate,
      params.endDate,
    );

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
      createdAt: { gte: start, lt: end },
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
    // TIMESTAMP columns — the picked days are Tashkent days, and `end` is the
    // EXCLUSIVE start of the day after (see common/date/tashkent).
    const { gte: start, lt: end } = tashkentRangeUtc(
      params.startDate,
      params.endDate,
    );

    const where: any = {
      ...buildDepartedEnrollmentWhere(companyId, params),
      status: 'TRANSFERRED' as const,
      statusChangedAt: { gte: start, lt: end },
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
   * Drill-down for the teacher-change retention card: the students who "left"
   * within 5 lessons of a teacher change, newest departure first. Who left,
   * and when, is decided in `loadTeacherChangeDepartures` — the same reader
   * behind the card's count (`getTeacherChangeRetentionMetrics`), so the list
   * and the count agree.
   */
  async getDepartedAfterTeacherChangeList(
    companyId: number,
    params: { branchId?: number; startDate: string; endDate: string },
  ) {
    // TIMESTAMP columns — the picked days are Tashkent days, and `end` is the
    // EXCLUSIVE start of the day after (see common/date/tashkent).
    const { gte: start, lt: end } = tashkentRangeUtc(
      params.startDate,
      params.endDate,
    );

    const { departures } = await loadTeacherChangeDepartures(
      this.prisma,
      companyId,
      {
        scope: params.branchId !== undefined ? [params.branchId] : null,
        start,
        end,
      },
    );
    if (departures.length === 0) return [];

    const teacherIds = Array.from(
      new Set(
        departures.flatMap((d) => [
          ...d.change.previousTeacherIds,
          ...d.change.newTeacherIds,
        ]),
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
    const names = (ids: number[]) =>
      ids.map((id) => teacherMap.get(id) ?? `#${id}`);

    return departures
      .map(({ change, enrollment: e, ...d }) => ({
        enrollmentId: e.id,
        studentId: e.studentId,
        studentName: `${e.student.firstName} ${e.student.lastName}`,
        groupId: change.groupId,
        groupName: e.group.name,
        branchName: e.group.branch.name,
        teacherChangeAt: change.createdAt,
        departedAt: d.departedAt,
        departureStatus: d.departureStatus,
        lessonNumber: d.lessonNumber,
        previousTeachers: names(change.previousTeacherIds),
        newTeachers: names(change.newTeacherIds),
        departureReason: e.departureReason?.name ?? null,
      }))
      .sort((a, b) => b.departedAt.getTime() - a.departedAt.getTime());
  }
}
