import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildDepartedEnrollmentWhere } from './shared/departed-filter';

@Injectable()
export class ReportsDepartedReasonsService {
  constructor(private prisma: PrismaService) {}

  async getDepartedStudentsReasons(
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

    const where = {
      ...buildDepartedEnrollmentWhere(companyId, params),
      status: 'DROPPED' as const,
      statusChangedAt: { gte: start, lte: end },
    };

    const grouped = await this.prisma.enrollment.groupBy({
      by: ['departureReasonId'],
      where,
      _count: { _all: true },
    });

    const reasonIds = grouped
      .map((g) => g.departureReasonId)
      .filter((v): v is string => typeof v === 'string');

    const reasons =
      reasonIds.length > 0
        ? await this.prisma.departureReason.findMany({
            where: { id: { in: reasonIds } },
            select: { id: true, name: true },
          })
        : [];
    const nameById = new Map(reasons.map((r) => [r.id, r.name]));

    const data = grouped
      .map((g) => ({
        reasonId: g.departureReasonId,
        reasonName:
          g.departureReasonId === null
            ? "Sababi ko'rsatilmagan"
            : (nameById.get(g.departureReasonId) ?? "Noma'lum"),
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    return { data };
  }

  /**
   * Aggregates GroupTeacherHistory events by changeReasonId within the filter
   * window + group scope. Drives the "Nima uchun ustoz o'zgartirildi?" chart.
   */
  async getTeacherChangeReasons(
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

    const groupFilter: any = { companyId, deletedAt: null };
    if (params.branchId !== undefined) groupFilter.branchId = params.branchId;
    if (params.courseId) groupFilter.courseId = params.courseId;
    if (params.teacherIds && params.teacherIds.length > 0) {
      groupFilter.teachers = {
        some: { teacherId: { in: params.teacherIds } },
      };
    }

    const grouped = await this.prisma.groupTeacherHistory.groupBy({
      by: ['changeReasonId'],
      where: {
        createdAt: { gte: start, lte: end },
        group: groupFilter,
      },
      _count: { _all: true },
    });

    const reasonIds = grouped
      .map((g) => g.changeReasonId)
      .filter((v): v is string => typeof v === 'string');

    const reasons =
      reasonIds.length > 0
        ? await this.prisma.groupTeacherChangeReason.findMany({
            where: { id: { in: reasonIds } },
            select: { id: true, name: true },
          })
        : [];
    const nameById = new Map(reasons.map((r) => [r.id, r.name]));

    const data = grouped
      .map((g) => ({
        reasonId: g.changeReasonId,
        reasonName:
          g.changeReasonId === null
            ? "Sababi ko'rsatilmagan"
            : (nameById.get(g.changeReasonId) ?? "Noma'lum"),
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    return { data };
  }

  /**
   * Aggregates Enrollment.TRANSFERRED events by transferReasonId within the
   * filter window + group scope. Drives the "Nima uchun o'quvchi guruhni
   * o'zgartirdi?" chart.
   */
  async getTransferReasons(
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

    const where = {
      ...buildDepartedEnrollmentWhere(companyId, params),
      status: 'TRANSFERRED' as const,
      statusChangedAt: { gte: start, lte: end },
    };

    const grouped = await this.prisma.enrollment.groupBy({
      by: ['transferReasonId'],
      where,
      _count: { _all: true },
    });

    const reasonIds = grouped
      .map((g) => g.transferReasonId)
      .filter((v): v is string => typeof v === 'string');

    const reasons =
      reasonIds.length > 0
        ? await this.prisma.enrollmentTransferReason.findMany({
            where: { id: { in: reasonIds } },
            select: { id: true, name: true },
          })
        : [];
    const nameById = new Map(reasons.map((r) => [r.id, r.name]));

    const data = grouped
      .map((g) => ({
        reasonId: g.transferReasonId,
        reasonName:
          g.transferReasonId === null
            ? "Sababi ko'rsatilmagan"
            : (nameById.get(g.transferReasonId) ?? "Noma'lum"),
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    return { data };
  }
}
