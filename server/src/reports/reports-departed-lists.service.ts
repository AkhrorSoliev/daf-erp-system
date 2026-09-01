import { Injectable } from '@nestjs/common';
import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildDepartedEnrollmentWhere } from './shared/departed-filter';
import {
  loadDepartedStudents,
  DEPARTED_STATUS_LABELS,
} from './shared/departed-students-dataset';

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
      debtorsOnly?: boolean;
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
    // "Faqat qarzdorlar" — only students who owe money (negative balance).
    if (params.debtorsOnly) {
      where.balance = { lt: 0 };
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
          balance: true,
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
        balance: s.balance,
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

  /**
   * "Holat bo'yicha" — the departed-students snapshot broken down by student
   * status (Faol-guruhsiz / Muzlatilgan / Chetlatilgan ...). Replaces the old
   * "Ketish sabablari" chart: freeze reasons are unstructured free text, so a
   * status breakdown is the reliable, always-complete view.
   */
  async getDepartedStudentsByStatus(
    companyId: number,
    params: { branchId?: number },
  ) {
    const departed = await loadDepartedStudents(this.prisma, companyId, {
      branchId: params.branchId,
    });

    const counts = new Map<StudentStatus, number>();
    for (const r of departed) {
      counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    }

    const data = [...counts.entries()]
      .map(([status, count]) => ({
        status,
        label: DEPARTED_STATUS_LABELS[status] ?? status,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return { data, total: departed.length };
  }

  /**
   * "Guruh / o'qituvchi / filial bo'yicha" — the departed-students snapshot
   * bucketed by the last group's course / teacher / branch, each bucket
   * segmented by student status. Built from loadDepartedStudents so the
   * figures reconcile with the "Ketgan o'quvchilar" list.
   */
  async getDepartedStudentsGroupBy(
    companyId: number,
    params: {
      branchId?: number;
      groupBy: 'course' | 'teacher' | 'branch';
    },
  ) {
    const departed = await loadDepartedStudents(this.prisma, companyId, {
      branchId: params.branchId,
    });

    type SegMap = Map<StudentStatus, number>;
    const buckets = new Map<string, { name: string; segments: SegMap }>();

    const addSegment = (id: string, name: string, status: StudentStatus) => {
      let bucket = buckets.get(id);
      if (!bucket) {
        bucket = { name, segments: new Map() };
        buckets.set(id, bucket);
      }
      bucket.segments.set(status, (bucket.segments.get(status) ?? 0) + 1);
    };

    for (const r of departed) {
      if (params.groupBy === 'course') {
        if (r.course) addSegment(r.course.id, r.course.name, r.status);
      } else if (params.groupBy === 'branch') {
        if (r.branch) addSegment(String(r.branch.id), r.branch.name, r.status);
      } else {
        for (const t of r.teachers) {
          addSegment(String(t.id), t.fullName, r.status);
        }
      }
    }

    const result = Array.from(buckets.entries()).map(([id, bucket]) => {
      const segments = Array.from(bucket.segments.entries())
        .map(([status, count]) => ({
          status,
          label: DEPARTED_STATUS_LABELS[status] ?? status,
          count,
        }))
        .sort((a, b) => b.count - a.count);
      const total = segments.reduce((sum, s) => sum + s.count, 0);
      return { id, name: bucket.name, total, segments };
    });
    result.sort((a, b) => b.total - a.total);

    // Authoritative total — for `teacher` groupBy a student appears under
    // every teacher of their last group, so summing bucket totals overcounts.
    const uniqueTotal = departed.length;

    return { data: result, uniqueTotal };
  }
}
