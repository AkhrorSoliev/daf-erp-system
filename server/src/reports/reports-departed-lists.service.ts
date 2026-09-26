import { Injectable } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportBranchIds } from '../common/finance/report-branch-scope';
import { buildDepartedEnrollmentWhere } from './shared/departed-filter';
import { DEPARTED_STATUS_LABELS } from './shared/departed-status-labels';
import { loadDepartures } from './shared/departures.loader';
import { openEpisodes } from '../students/shared/departure-episodes';
import { tashkentRangeUtc } from '../common/date/tashkent';

@Injectable()
export class ReportsDepartedListsService {
  constructor(private prisma: PrismaService) {}

  /**
   * "Qaytmagan ketganlar" — every open departure episode (ADR-0035): the
   * students who stopped and have not come back, pending ones included.
   * Filtered by branch, status and debt; not by the date range.
   */
  async getDepartedStudentsList(
    companyId: number,
    params: {
      scope: ReportBranchIds;
      status?: StudentStatus;
      debtorsOnly?: boolean;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10));
    // GRADUATED is never a departure, so it is not a valid filter either.
    const status =
      params.status && params.status !== StudentStatus.GRADUATED
        ? params.status
        : undefined;

    const rows = (await this.openRows(companyId, params.scope))
      .filter((r) => !status || r.student.status === status)
      .filter((r) => !params.debtorsOnly || r.student.balance < 0)
      .sort(
        (a, b) =>
          b.episode.startedAt.getTime() - a.episode.startedAt.getTime() ||
          b.student.id - a.student.id,
      );

    const data = rows
      .slice((page - 1) * pageSize, page * pageSize)
      .map(({ episode, student }) => {
        const g = student.enrollments[0]?.group ?? null;
        return {
          id: String(student.id),
          student: {
            id: student.id,
            fullName: `${student.firstName} ${student.lastName}`,
          },
          phone: student.phone,
          status: student.status,
          balance: student.balance,
          lastGroup: g ? { id: g.id, name: g.name } : null,
          branch: g?.branch ?? null,
          course: g?.course ?? null,
          teachers:
            g?.teachers.map((t) => ({
              id: t.teacher.id,
              fullName: `${t.teacher.firstName} ${t.teacher.lastName}`,
            })) ?? [],
          departedAt: episode.startedAt.toISOString(),
          state: episode.state,
          stopKind: episode.stopKind,
        };
      });

    return { data, total: rows.length, page, pageSize };
  }

  /**
   * Enrollment-level list of DROPPED enrollments within a date range,
   * optionally narrowed to one departure reason. Powers the "Ketish
   * sabablari" chart's drill-down dialog — reasons live on the Enrollment
   * (`departureReasonId`), so that breakdown is inherently enrollment-level.
   *
   * Distinct from getDepartedStudentsList, which is the student-level "has no
   * group right now" snapshot.
   */
  async getDepartedStudentsByReason(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string[];
      teacherIds?: number[];
      startDate: string;
      endDate: string;
      page?: number;
      pageSize?: number;
      departureReasonId?: string;
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
      status: 'DROPPED' as const,
      statusChangedAt: { gte: start, lt: end },
    };
    // "null" literal → enrollments with no reason set; otherwise exact match.
    if (params.departureReasonId !== undefined) {
      where.departureReasonId =
        params.departureReasonId === 'null' ? null : params.departureReasonId;
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
          statusChangeReason: true,
          departureReasonId: true,
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
          group: {
            select: {
              id: true,
              name: true,
              branch: { select: { id: true, name: true } },
              course: { select: { id: true, name: true } },
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
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      student: {
        id: r.student.id,
        fullName: `${r.student.firstName} ${r.student.lastName}`,
      },
      group: r.group ? { id: r.group.id, name: r.group.name } : null,
      branch: r.group?.branch ?? null,
      course: r.group?.course ?? null,
      teachers:
        r.group?.teachers.map((t) => ({
          id: t.teacher.id,
          fullName: `${t.teacher.firstName} ${t.teacher.lastName}`,
        })) ?? [],
      enrolledAt: r.createdAt.toISOString(),
      departedAt: r.statusChangedAt?.toISOString() ?? null,
      reason: r.statusChangeReason,
      departureReasonId: r.departureReasonId,
    }));

    return { data, total, page, pageSize };
  }

  /** "Holat bo'yicha" — open departures by the student's current status. */
  async getDepartedStudentsByStatus(
    companyId: number,
    params: { scope: ReportBranchIds },
  ) {
    const rows = await this.openRows(companyId, params.scope);
    const counts = new Map<StudentStatus, number>();
    for (const { student } of rows) {
      counts.set(student.status, (counts.get(student.status) ?? 0) + 1);
    }
    const data = [...counts.entries()]
      .map(([status, count]) => ({
        status,
        label: DEPARTED_STATUS_LABELS[status] ?? status,
        count,
      }))
      .sort((a, b) => b.count - a.count);
    return { data, total: rows.length };
  }

  /**
   * "Kesim bo'yicha" — open departures bucketed by the last group's course /
   * teacher / branch, each bucket split by student status. A student sits
   * under every teacher of that group, so `uniqueTotal` is the real count.
   */
  async getDepartedStudentsGroupBy(
    companyId: number,
    params: {
      scope: ReportBranchIds;
      groupBy: 'course' | 'teacher' | 'branch';
    },
  ) {
    const rows = await this.openRows(companyId, params.scope);
    const buckets = new Map<
      string,
      { name: string; segments: Map<StudentStatus, number> }
    >();
    const add = (id: string, name: string, status: StudentStatus) => {
      let bucket = buckets.get(id);
      if (!bucket) {
        bucket = { name, segments: new Map() };
        buckets.set(id, bucket);
      }
      bucket.segments.set(status, (bucket.segments.get(status) ?? 0) + 1);
    };

    for (const { student } of rows) {
      const g = student.enrollments[0]?.group;
      if (!g) continue;
      if (params.groupBy === 'course') {
        add(g.course.id, g.course.name, student.status);
      } else if (params.groupBy === 'branch') {
        add(String(g.branch.id), g.branch.name, student.status);
      } else {
        for (const t of g.teachers) {
          add(
            String(t.teacher.id),
            `${t.teacher.firstName} ${t.teacher.lastName}`,
            student.status,
          );
        }
      }
    }

    const data = [...buckets.entries()]
      .map(([id, bucket]) => {
        const segments = [...bucket.segments.entries()]
          .map(([status, count]) => ({
            status,
            label: DEPARTED_STATUS_LABELS[status] ?? status,
            count,
          }))
          .sort((a, b) => b.count - a.count);
        const total = segments.reduce((sum, s) => sum + s.count, 0);
        return { id, name: bucket.name, total, segments };
      })
      .sort((a, b) => b.total - a.total);

    return { data, uniqueTotal: rows.length };
  }

  /** Open departure episodes with the card and last group of each student. */
  private async openRows(companyId: number, scope: ReportBranchIds) {
    const { episodes } = await loadDepartures(this.prisma, companyId, scope);
    const open = openEpisodes(episodes);
    if (open.length === 0) return [];
    const students = await this.prisma.student.findMany({
      where: { id: { in: open.map((e) => e.studentId) } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        balance: true,
        // The last group the student belonged to.
        enrollments: {
          where: { deletedAt: null },
          orderBy: [
            { statusChangedAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
          ],
          take: 1,
          select: {
            group: {
              select: {
                id: true,
                name: true,
                branch: { select: { id: true, name: true } },
                course: { select: { id: true, name: true } },
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
        },
      },
    });
    const byId = new Map(students.map((s) => [s.id, s]));
    return open.flatMap((episode) => {
      const student = byId.get(episode.studentId);
      return student ? [{ episode, student }] : [];
    });
  }
}
