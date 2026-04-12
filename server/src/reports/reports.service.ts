import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ReportsQueryDto } from './dto/reports-query.dto';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ─── KPIs ─────────────────────────────────────────────────────────

  async getKpis(companyId: number, query: ReportsQueryDto) {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

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
      // Current active students
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          ...branchStudentFilter,
        },
      }),

      // Active students as of last month (created before this month and not yet churned before this month)
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          createdAt: { lt: firstOfMonth },
          ...branchStudentFilter,
        },
      }),

      // Active groups
      this.prisma.group.count({
        where: {
          companyId,
          deletedAt: null,
          statusEnum: 'ACTIVE',
          ...branchGroupFilter,
        },
      }),

      // New students this month
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: firstOfMonth },
          ...branchStudentFilter,
        },
      }),

      // Expelled this month
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'EXPELLED',
          statusChangedAt: { gte: firstOfMonth },
          ...branchStudentFilter,
        },
      }),

      // Dropped enrollments this month
      this.prisma.enrollment.count({
        where: {
          deletedAt: null,
          status: 'DROPPED',
          statusChangedAt: { gte: firstOfMonth },
          group: { companyId, ...branchGroupFilter },
        },
      }),

      // Attendance this month
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: {
          companyId,
          date: { gte: firstOfMonth },
          ...(query.branchId
            ? { group: { branchId: query.branchId } }
            : {}),
        },
        _count: { id: true },
      }),

      // Total leads (excluding archived)
      this.prisma.lead.count({
        where: { deletedAt: null },
      }),

      // Converted leads
      this.prisma.lead.count({
        where: { deletedAt: null, statusEnum: 'CONVERTED' },
      }),
    ]);

    // Compute attendance rate
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

    // Trend: compare current active vs last month active
    const trend =
      lastMonthActiveStudents > 0
        ? Math.round(
            ((activeStudents - lastMonthActiveStudents) /
              lastMonthActiveStudents) *
              100,
          )
        : 0;

    const leadConversionRate =
      totalLeads > 0
        ? Math.round((convertedLeads / totalLeads) * 100)
        : 0;

    return {
      activeStudents: { current: activeStudents, trend },
      activeGroups,
      averageAttendance,
      leadConversionRate,
      newStudentsThisMonth,
      churnedThisMonth: expelledThisMonth + droppedThisMonth,
    };
  }

  // ─── ROOM UTILIZATION ─────────────────────────────────────────────

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

    // Group the groups by roomId
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
            (max, r) => ((r.hoursPerWeek || 0) > (max?.hoursPerWeek || 0) ? r : max),
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

  // ─── TEACHER PERFORMANCE ──────────────────────────────────────────

  async getTeacherPerformance(companyId: number, query: ReportsQueryDto) {
    const cacheKey = `reports:teacher-perf:${companyId}:${query.branchId || 'all'}:${query.startDate || ''}:${query.endDate || ''}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const groupWhere: any = {
      companyId,
      deletedAt: null,
      statusEnum: { in: ['ACTIVE', 'FORMING'] },
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };

    const groupTeachers = await this.prisma.groupTeacher.findMany({
      where: { group: groupWhere },
      select: {
        teacherId: true,
        groupId: true,
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photo: true,
          },
        },
        group: {
          select: {
            id: true,
            roomId: true,
            room: { select: { capacity: true } },
            enrollments: {
              where: { status: 'ACTIVE', deletedAt: null },
              select: { id: true },
            },
          },
        },
      },
    });

    // Collect unique teacher data
    const teacherMap = new Map<
      number,
      {
        id: number;
        firstName: string;
        lastName: string;
        photo: string | null;
        groupIds: string[];
        totalEnrolled: number;
        totalCapacity: number;
        groupsWithCapacity: number;
      }
    >();

    for (const gt of groupTeachers) {
      let t = teacherMap.get(gt.teacherId);
      if (!t) {
        t = {
          id: gt.teacher.id,
          firstName: gt.teacher.firstName,
          lastName: gt.teacher.lastName,
          photo: gt.teacher.photo,
          groupIds: [],
          totalEnrolled: 0,
          totalCapacity: 0,
          groupsWithCapacity: 0,
        };
        teacherMap.set(gt.teacherId, t);
      }
      t.groupIds.push(gt.groupId);
      const enrolled = gt.group.enrollments.length;
      t.totalEnrolled += enrolled;
      if (gt.group.room?.capacity) {
        t.totalCapacity += gt.group.room.capacity;
        t.groupsWithCapacity++;
      }
    }

    // Get attendance for all relevant groups
    const allGroupIds = [
      ...new Set(groupTeachers.map((gt) => gt.groupId)),
    ];

    const dateFilter = this.buildDateFilter(query);
    const attendanceByGroup =
      allGroupIds.length > 0
        ? await this.prisma.attendance.groupBy({
            by: ['groupId', 'status'],
            where: {
              companyId,
              groupId: { in: allGroupIds },
              ...dateFilter,
            },
            _count: { id: true },
          })
        : [];

    // Build attendance map: groupId -> { total, presentLate }
    const attMap = new Map<
      string,
      { total: number; presentLate: number }
    >();
    for (const a of attendanceByGroup) {
      const entry = attMap.get(a.groupId) || { total: 0, presentLate: 0 };
      entry.total += a._count.id;
      if (a.status === 'PRESENT' || a.status === 'LATE') {
        entry.presentLate += a._count.id;
      }
      attMap.set(a.groupId, entry);
    }

    const teachers = [...teacherMap.values()].map((t) => {
      let totalAtt = 0;
      let totalPresentLate = 0;
      for (const gid of t.groupIds) {
        const att = attMap.get(gid);
        if (att) {
          totalAtt += att.total;
          totalPresentLate += att.presentLate;
        }
      }

      const averageAttendance =
        totalAtt > 0 ? Math.round((totalPresentLate / totalAtt) * 100) : null;

      const averageFillRate =
        t.groupsWithCapacity > 0
          ? Math.round((t.totalEnrolled / t.totalCapacity) * 100)
          : null;

      return {
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        photo: t.photo,
        groupsCount: t.groupIds.length,
        averageAttendance,
        averageFillRate,
      };
    });

    // Sort by attendance descending
    teachers.sort(
      (a, b) => (b.averageAttendance ?? 0) - (a.averageAttendance ?? 0),
    );

    const result = { teachers };
    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

  // ─── ATTENDANCE ANALYTICS ─────────────────────────────────────────

  async getAttendanceAnalytics(companyId: number, query: ReportsQueryDto) {
    const dateFilter = this.buildDateFilter(query);
    const branchGroupIds = await this.getBranchGroupIds(
      companyId,
      query.branchId,
    );
    const groupIdFilter = branchGroupIds
      ? { groupId: { in: branchGroupIds } }
      : {};

    const attendanceData = await this.prisma.attendance.groupBy({
      by: ['date', 'status'],
      where: {
        companyId,
        ...dateFilter,
        ...groupIdFilter,
      },
      _count: { id: true },
      orderBy: { date: 'asc' },
    });

    // Overall rate
    let totalAll = 0;
    let totalPresentLate = 0;

    // Weekly trend
    const weekMap = new Map<string, { total: number; presentLate: number }>();

    // Day of week
    const dayMap = new Map<number, { total: number; presentLate: number }>();

    for (const row of attendanceData) {
      const count = row._count.id;
      const isPresentLate = row.status === 'PRESENT' || row.status === 'LATE';

      totalAll += count;
      if (isPresentLate) totalPresentLate += count;

      // Weekly bucket
      const weekKey = this.getISOWeek(row.date);
      const week = weekMap.get(weekKey) || { total: 0, presentLate: 0 };
      week.total += count;
      if (isPresentLate) week.presentLate += count;
      weekMap.set(weekKey, week);

      // Day of week bucket
      const day = row.date.getDay();
      const dayEntry = dayMap.get(day) || { total: 0, presentLate: 0 };
      dayEntry.total += count;
      if (isPresentLate) dayEntry.presentLate += count;
      dayMap.set(day, dayEntry);
    }

    const overallRate =
      totalAll > 0 ? Math.round((totalPresentLate / totalAll) * 100) : 0;

    const weeklyTrend = [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => ({
        week,
        rate: Math.round((data.presentLate / data.total) * 100),
      }));

    const dayNames = [
      'Yakshanba',
      'Dushanba',
      'Seshanba',
      'Chorshanba',
      'Payshanba',
      'Juma',
      'Shanba',
    ];
    const byDayOfWeek = [...dayMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([day, data]) => ({
        day: dayNames[day],
        rate: Math.round((data.presentLate / data.total) * 100),
      }));

    // Worst groups
    const groupAttendance = await this.prisma.attendance.groupBy({
      by: ['groupId', 'status'],
      where: {
        companyId,
        ...dateFilter,
        ...groupIdFilter,
      },
      _count: { id: true },
    });

    const groupRateMap = new Map<
      string,
      { total: number; presentLate: number }
    >();
    for (const row of groupAttendance) {
      const entry = groupRateMap.get(row.groupId) || {
        total: 0,
        presentLate: 0,
      };
      entry.total += row._count.id;
      if (row.status === 'PRESENT' || row.status === 'LATE') {
        entry.presentLate += row._count.id;
      }
      groupRateMap.set(row.groupId, entry);
    }

    const worstGroupIds = [...groupRateMap.entries()]
      .map(([groupId, data]) => ({
        groupId,
        rate: Math.round((data.presentLate / data.total) * 100),
        total: data.total,
      }))
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5);

    // Fetch group names
    const groupNames =
      worstGroupIds.length > 0
        ? await this.prisma.group.findMany({
            where: {
              id: { in: worstGroupIds.map((g) => g.groupId) },
            },
            select: { id: true, name: true },
          })
        : [];

    const nameMap = new Map(groupNames.map((g) => [g.id, g.name]));

    const worstGroups = worstGroupIds.map((g) => ({
      groupId: g.groupId,
      groupName: nameMap.get(g.groupId) ?? '',
      rate: g.rate,
    }));

    return { overallRate, weeklyTrend, byDayOfWeek, worstGroups };
  }

  // ─── GROUP ANALYTICS ──────────────────────────────────────────────

  async getGroupAnalytics(companyId: number, query: ReportsQueryDto) {
    const branchFilter = query.branchId
      ? { branchId: query.branchId }
      : {};

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

    // Sort by fill rate ascending (emptiest first)
    fillRates.sort((a, b) => (a.fillRate ?? 0) - (b.fillRate ?? 0));

    const formingGroups = fillRates.filter(
      (g) =>
        groups.find((gr) => gr.id === g.groupId)?.statusEnum === 'FORMING',
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

  // ─── LEAD ANALYTICS ───────────────────────────────────────────────

  async getLeadAnalytics(query: ReportsQueryDto) {
    const dateFilter: any = {};
    if (query.startDate) dateFilter.gte = new Date(query.startDate);
    if (query.endDate) dateFilter.lte = new Date(query.endDate);
    const createdAtFilter =
      Object.keys(dateFilter).length > 0
        ? { createdAt: dateFilter }
        : {};

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

    // Funnel
    const funnelData = funnel.map((f) => ({
      status: f.statusEnum,
      count: f._count.id,
    }));

    // Conversion rate over time (last 6 months)
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const allLeadsByMonth = await this.prisma.lead.groupBy({
      by: ['statusEnum'],
      where: {
        deletedAt: null,
        createdAt: { gte: sixMonthsAgo },
      },
      _count: { id: true },
    });

    // Get monthly lead creation counts
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
          data.total > 0
            ? Math.round((data.converted / data.total) * 100)
            : 0,
        total: data.total,
        converted: data.converted,
      }));

    // Average days to conversion
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

  // ─── HELPERS ──────────────────────────────────────────────────────

  private computeLessonHours(
    startTime: string | null,
    endTime: string | null,
  ): number {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return (eh * 60 + em - (sh * 60 + sm)) / 60;
  }

  private getISOWeek(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum =
      1 +
      Math.round(
        ((d.getTime() - week1.getTime()) / 86400000 -
          3 +
          ((week1.getDay() + 6) % 7)) /
          7,
      );
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  private buildDateFilter(query: ReportsQueryDto): any {
    const filter: any = {};
    if (query.startDate || query.endDate) {
      filter.date = {};
      if (query.startDate) filter.date.gte = new Date(query.startDate);
      if (query.endDate) filter.date.lte = new Date(query.endDate);
    }
    return filter;
  }

  private async getBranchGroupIds(
    companyId: number,
    branchId?: number,
  ): Promise<string[] | null> {
    if (!branchId) return null;
    const groups = await this.prisma.group.findMany({
      where: {
        companyId,
        branchId,
        deletedAt: null,
        statusEnum: { in: ['ACTIVE', 'FORMING'] },
      },
      select: { id: true },
    });
    return groups.map((g) => g.id);
  }

  private avg(values: (number | null)[]): number {
    const valid = values.filter((v): v is number => v !== null);
    if (valid.length === 0) return 0;
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  }
}
