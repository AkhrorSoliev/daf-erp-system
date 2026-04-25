import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildDepartedEnrollmentWhere } from './shared/departed-filter';

@Injectable()
export class ReportsDepartedListsService {
  constructor(private prisma: PrismaService) {}

  async getDepartedStudentsList(
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
    // "null" literal → students with no reason set; otherwise exact match.
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
        ? await this.prisma.departureReason.findMany({
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
