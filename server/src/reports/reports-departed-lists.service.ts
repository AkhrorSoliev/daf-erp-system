import { Injectable } from '@nestjs/common';
import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildDepartedEnrollmentWhere } from './shared/departed-filter';

@Injectable()
export class ReportsDepartedListsService {
  constructor(private prisma: PrismaService) {}

  /**
   * "Ketgan o'quvchilar" list — a student-level snapshot.
   *
   * A student is "departed" when they currently study in NO group, i.e. they
   * have zero ACTIVE enrollments. A FROZEN enrollment does not count as an
   * active group (a frozen student is still "ketgan" until they resume).
   * GRADUATED students finished successfully and are never treated as
   * departed.
   *
   * This is intentionally NOT date-ranged: it answers "who has no group right
   * now", so admins can follow up with them.
   */
  async getDepartedStudentsList(
    companyId: number,
    params: {
      branchId?: number;
      status?: StudentStatus;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10));

    // GRADUATED is never a valid filter value — graduated students are
    // excluded by definition. Any other status narrows the list.
    const statusFilter =
      params.status && params.status !== StudentStatus.GRADUATED
        ? params.status
        : undefined;

    const where: Prisma.StudentWhereInput = {
      companyId,
      deletedAt: null,
      enrollments: { none: { status: 'ACTIVE', deletedAt: null } },
      status: statusFilter ?? { not: StudentStatus.GRADUATED },
    };
    if (params.branchId !== undefined) {
      where.branches = { some: { branchId: params.branchId } };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        orderBy: [{ statusChangedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          statusChangedAt: true,
          // The most recent enrollment = the last group the student was
          // attached to. Used to show "where they were" + when they left.
          enrollments: {
            where: { deletedAt: null },
            orderBy: [{ statusChangedAt: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: {
              status: true,
              statusChangedAt: true,
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
      }),
      this.prisma.student.count({ where }),
    ]);

    const data = rows.map((s) => {
      const lastEnr = s.enrollments[0] ?? null;
      const g = lastEnr?.group ?? null;
      return {
        id: String(s.id),
        student: {
          id: s.id,
          fullName: `${s.firstName} ${s.lastName}`,
        },
        phone: s.phone,
        status: s.status,
        lastGroup: g ? { id: g.id, name: g.name } : null,
        branch: g?.branch ?? null,
        course: g?.course ?? null,
        teachers:
          g?.teachers.map((t) => ({
            id: t.teacher.id,
            fullName: `${t.teacher.firstName} ${t.teacher.lastName}`,
          })) ?? [],
        // When the student lost their last group. Falls back to the student's
        // own status-change date when no enrollment exists.
        leftAt:
          (lastEnr?.statusChangedAt ?? s.statusChangedAt)?.toISOString() ??
          null,
      };
    });

    return { data, total, page, pageSize };
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
      courseId?: string;
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
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    end.setHours(23, 59, 59, 999);

    const where: any = {
      ...buildDepartedEnrollmentWhere(companyId, params),
      status: 'DROPPED' as const,
      statusChangedAt: { gte: start, lte: end },
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

  async getDepartedStudentsGroupBy(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
      groupBy: 'course' | 'teacher' | 'branch';
    },
  ) {
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    end.setHours(23, 59, 59, 999);

    const where = {
      ...buildDepartedEnrollmentWhere(companyId, params),
      status: 'DROPPED' as const,
      statusChangedAt: { gte: start, lte: end },
    };

    const enrollments = await this.prisma.enrollment.findMany({
      where,
      select: {
        departureReasonId: true,
        group: {
          select: {
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
    });

    const allReasonIds = Array.from(
      new Set(
        enrollments
          .map((e) => e.departureReasonId)
          .filter((v): v is string => typeof v === 'string'),
      ),
    );
    const reasons =
      allReasonIds.length > 0
        ? await this.prisma.studentExitReason.findMany({
            where: { id: { in: allReasonIds } },
            select: { id: true, name: true },
          })
        : [];
    const reasonNameById = new Map(reasons.map((r) => [r.id, r.name]));
    const reasonLabel = (id: string | null) =>
      id === null
        ? "Sababi ko'rsatilmagan"
        : (reasonNameById.get(id) ?? "Noma'lum");

    type SegMap = Map<string, { reasonId: string | null; count: number }>;
    const buckets = new Map<string, { name: string; segments: SegMap }>();

    const addSegment = (
      groupId: string,
      groupName: string,
      reasonId: string | null,
    ) => {
      let bucket = buckets.get(groupId);
      if (!bucket) {
        bucket = { name: groupName, segments: new Map() };
        buckets.set(groupId, bucket);
      }
      const segKey = reasonId ?? '__null__';
      const seg = bucket.segments.get(segKey);
      if (seg) {
        seg.count += 1;
      } else {
        bucket.segments.set(segKey, { reasonId, count: 1 });
      }
    };

    for (const e of enrollments) {
      const g = e.group;
      if (!g) continue;
      if (params.groupBy === 'course') {
        if (g.course)
          addSegment(g.course.id, g.course.name, e.departureReasonId);
      } else if (params.groupBy === 'branch') {
        if (g.branch)
          addSegment(String(g.branch.id), g.branch.name, e.departureReasonId);
      } else {
        for (const gt of g.teachers) {
          const t = gt.teacher;
          addSegment(
            String(t.id),
            `${t.firstName} ${t.lastName}`,
            e.departureReasonId,
          );
        }
      }
    }

    const result = Array.from(buckets.entries()).map(([id, bucket]) => {
      const segments = Array.from(bucket.segments.values())
        .map((s) => ({
          reasonId: s.reasonId,
          reasonName: reasonLabel(s.reasonId),
          count: s.count,
        }))
        .sort((a, b) => b.count - a.count);
      const total = segments.reduce((sum, s) => sum + s.count, 0);
      return { id, name: bucket.name, total, segments };
    });
    result.sort((a, b) => b.total - a.total);

    // Total unique departed enrollments — for `teacher` groupBy, a single
    // enrollment appears under every teacher of its group, so summing bucket
    // totals overcounts. UI should display this as the authoritative total.
    const uniqueTotal = enrollments.length;

    return { data: result, uniqueTotal };
  }
}
