import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { equalsOrIn } from '../common/dto/to-array';
import { tashkentRangeUtc } from '../common/date/tashkent';

@Injectable()
export class ReportsDepartedReasonsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Aggregates GroupTeacherHistory events by changeReasonId within the filter
   * window + group scope. Drives the "Nima uchun ustoz o'zgartirildi?" chart.
   */
  async getTeacherChangeReasons(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string[];
      teacherIds?: number[];
      startDate: string;
      endDate: string;
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

    const grouped = await this.prisma.groupTeacherHistory.groupBy({
      by: ['changeReasonId'],
      where: {
        createdAt: { gte: start, lt: end },
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
}
