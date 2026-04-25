import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ReportsQueryDto } from './dto/reports-query.dto';

@Injectable()
export class ReportsOverviewService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getKpis(companyId: number, query: ReportsQueryDto) {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const branchStudentFilter = query.branchId
      ? { branches: { some: { branchId: query.branchId } } }
      : {};

    const branchGroupFilter = query.branchId
      ? { branchId: query.branchId }
      : {};

    const [
      activeStudents,
      lastMonthActiveStudents,
      activeGroups,
      newStudentsThisMonth,
      expelledThisMonth,
      droppedThisMonth,
      attendanceCounts,
      totalLeads,
      convertedLeads,
    ] = await Promise.all([
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          ...branchStudentFilter,
        },
      }),

      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          createdAt: { lt: firstOfMonth },
          ...branchStudentFilter,
        },
      }),

      this.prisma.group.count({
        where: {
          companyId,
          deletedAt: null,
          statusEnum: 'ACTIVE',
          ...branchGroupFilter,
        },
      }),

      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: firstOfMonth },
          ...branchStudentFilter,
        },
      }),

      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'EXPELLED',
          statusChangedAt: { gte: firstOfMonth },
          ...branchStudentFilter,
        },
      }),

      this.prisma.enrollment.count({
        where: {
          deletedAt: null,
          status: 'DROPPED',
          statusChangedAt: { gte: firstOfMonth },
          group: { companyId, ...branchGroupFilter },
        },
      }),

      this.prisma.attendance.groupBy({
        by: ['status'],
        where: {
          companyId,
          date: { gte: firstOfMonth },
          ...(query.branchId ? { group: { branchId: query.branchId } } : {}),
        },
        _count: { id: true },
      }),

      this.prisma.lead.count({
        where: { deletedAt: null },
      }),

      this.prisma.lead.count({
        where: { deletedAt: null, statusEnum: 'CONVERTED' },
      }),
    ]);

    const totalAttendance = attendanceCounts.reduce(
      (sum, a) => sum + a._count.id,
      0,
    );
    const presentAndLate = attendanceCounts
      .filter((a) => a.status === 'PRESENT' || a.status === 'LATE')
      .reduce((sum, a) => sum + a._count.id, 0);
    const averageAttendance =
      totalAttendance > 0
        ? Math.round((presentAndLate / totalAttendance) * 100)
        : 0;

    const trend =
      lastMonthActiveStudents > 0
        ? Math.round(
            ((activeStudents - lastMonthActiveStudents) /
              lastMonthActiveStudents) *
              100,
          )
        : 0;

    const leadConversionRate =
      totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

    return {
      activeStudents: { current: activeStudents, trend },
      activeGroups,
      averageAttendance,
      leadConversionRate,
      newStudentsThisMonth,
      churnedThisMonth: expelledThisMonth + droppedThisMonth,
    };
  }

  async getRoomUtilization(companyId: number, query: ReportsQueryDto) {
    const cacheKey = `reports:room-util:${companyId}:${query.branchId || 'all'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const roomWhere: any = {
      deletedAt: null,
      status: 'ACTIVE',
      ...(query.branchId ? { branchId: query.branchId } : { companyId }),
    };

    const [rooms, groups] = await Promise.all([
      this.prisma.room.findMany({
        where: roomWhere,
        select: { id: true, name: true, capacity: true, branchId: true },
        orderBy: { name: 'asc' },
      }),

      this.prisma.group.findMany({
        where: {
          companyId,
          deletedAt: null,
          statusEnum: { in: ['ACTIVE', 'FORMING'] },
          roomId: { not: null },
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
        select: {
          id: true,
          roomId: true,
          lessonStartTime: true,
          lessonEndTime: true,
          exactDays: true,
          enrollments: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: { id: true },
          },
        },
      }),
    ]);

    const groupsByRoom = new Map<string, typeof groups>();
    for (const g of groups) {
      if (!g.roomId) continue;
      const list = groupsByRoom.get(g.roomId) || [];
      list.push(g);
      groupsByRoom.set(g.roomId, list);
    }

    const roomStats = rooms.map((room) => {
      const roomGroups = groupsByRoom.get(room.id) || [];

      let hoursPerWeek = 0;
      let totalEnrolled = 0;

      for (const g of roomGroups) {
        const daysPerWeek = g.exactDays.length;
        const duration = this.computeLessonHours(
          g.lessonStartTime,
          g.lessonEndTime,
        );
        hoursPerWeek += duration * daysPerWeek;
        totalEnrolled += g.enrollments.length;
      }

      const avgFillRate =
        room.capacity && roomGroups.length > 0
          ? Math.round(
              (totalEnrolled / (room.capacity * roomGroups.length)) * 100,
            )
          : null;

      return {
        id: room.id,
        name: room.name,
        capacity: room.capacity,
        hoursPerWeek: Math.round(hoursPerWeek * 10) / 10,
        fillRate: avgFillRate,
        totalGroups: roomGroups.length,
        totalEnrolled,
      };
    });

    const result = {
      rooms: roomStats,
      summary: {
        totalRooms: rooms.length,
        averageFillRate: this.avg(roomStats.map((r) => r.fillRate)),
        mostUtilized:
          roomStats.reduce(
            (max, r) =>
              (r.hoursPerWeek || 0) > (max?.hoursPerWeek || 0) ? r : max,
            roomStats[0],
          )?.name ?? null,
        leastUtilized:
          roomStats.reduce(
            (min, r) =>
              (r.hoursPerWeek || Infinity) < (min?.hoursPerWeek || Infinity)
                ? r
                : min,
            roomStats[0],
          )?.name ?? null,
      },
    };

    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

  async getGroupAnalytics(companyId: number, query: ReportsQueryDto) {
    const branchFilter = query.branchId ? { branchId: query.branchId } : {};

    const [statusDistribution, groups] = await Promise.all([
      this.prisma.group.groupBy({
        by: ['statusEnum'],
        where: { companyId, deletedAt: null, ...branchFilter },
        _count: { id: true },
      }),

      this.prisma.group.findMany({
        where: {
          companyId,
          deletedAt: null,
          statusEnum: { in: ['ACTIVE', 'FORMING'] },
          ...branchFilter,
        },
        select: {
          id: true,
          name: true,
          statusEnum: true,
          roomId: true,
          room: { select: { capacity: true } },
          enrollments: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: { id: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const fillRates = groups.map((g) => {
      const enrolled = g.enrollments.length;
      const capacity = g.room?.capacity ?? null;
      return {
        groupId: g.id,
        groupName: g.name,
        enrolled,
        capacity,
        fillRate:
          capacity && capacity > 0
            ? Math.round((enrolled / capacity) * 100)
            : null,
      };
    });

    fillRates.sort((a, b) => (a.fillRate ?? 0) - (b.fillRate ?? 0));

    const formingGroups = fillRates.filter(
      (g) => groups.find((gr) => gr.id === g.groupId)?.statusEnum === 'FORMING',
    );

    return {
      statusDistribution: statusDistribution.map((s) => ({
        status: s.statusEnum,
        count: s._count.id,
      })),
      fillRates,
      formingGroups,
    };
  }

  async getLeadAnalytics(query: ReportsQueryDto) {
    const dateFilter: any = {};
    if (query.startDate) dateFilter.gte = new Date(query.startDate);
    if (query.endDate) dateFilter.lte = new Date(query.endDate);
    const createdAtFilter =
      Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const [funnel, convertedLeads] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['statusEnum'],
        where: { deletedAt: null, ...createdAtFilter },
        _count: { id: true },
      }),

      this.prisma.lead.findMany({
        where: {
          deletedAt: null,
          statusEnum: 'CONVERTED',
          statusChangedAt: { not: null },
        },
        select: { createdAt: true, statusChangedAt: true },
      }),
    ]);

    const funnelData = funnel.map((f) => ({
      status: f.statusEnum,
      count: f._count.id,
    }));

    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const leadsCreatedByMonth = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true, statusEnum: true },
    });

    const monthlyConversion = new Map<
      string,
      { total: number; converted: number }
    >();

    for (const lead of leadsCreatedByMonth) {
      const monthKey = `${lead.createdAt.getFullYear()}-${String(lead.createdAt.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthlyConversion.get(monthKey) || {
        total: 0,
        converted: 0,
      };
      entry.total++;
      if (lead.statusEnum === 'CONVERTED') entry.converted++;
      monthlyConversion.set(monthKey, entry);
    }

    const conversionRateOverTime = [...monthlyConversion.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        rate:
          data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
        total: data.total,
        converted: data.converted,
      }));

    let totalDays = 0;
    let count = 0;
    for (const lead of convertedLeads) {
      if (lead.statusChangedAt) {
        const days = Math.round(
          (lead.statusChangedAt.getTime() - lead.createdAt.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        totalDays += days;
        count++;
      }
    }

    const averageDaysToConversion =
      count > 0 ? Math.round(totalDays / count) : null;

    return {
      funnel: funnelData,
      conversionRateOverTime,
      averageDaysToConversion,
    };
  }

  private computeLessonHours(
    startTime: string | null,
    endTime: string | null,
  ): number {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return (eh * 60 + em - (sh * 60 + sm)) / 60;
  }

  private avg(values: (number | null)[]): number {
    const valid = values.filter((v): v is number => v !== null);
    if (valid.length === 0) return 0;
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  }
}
