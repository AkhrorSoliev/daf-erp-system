import { Injectable, NotFoundException } from '@nestjs/common';
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
          ...(query.branchId ? { group: { branchId: query.branchId } } : {}),
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
    const allGroupIds = [...new Set(groupTeachers.map((gt) => gt.groupId))];

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
    const attMap = new Map<string, { total: number; presentLate: number }>();
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

    // Sort by fill rate ascending (emptiest first)
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

  // ─── LEAD ANALYTICS ───────────────────────────────────────────────

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
          data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
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

  /**
   * Financial overview: expected vs actual income, salary, expenses.
   */
  async getFinancialOverview(
    companyId: number,
    query: { branchId?: number; startDate?: string; endDate?: string },
  ) {
    // Default to current month
    const now = new Date();
    const start =
      query.startDate ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const end =
      query.endDate ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

    const dateFilter = {
      gte: new Date(start),
      lte: new Date(end + 'T23:59:59.999Z'),
    };

    // Actual income (payments received)
    const actualIncome = await this.prisma.payment.aggregate({
      where: {
        companyId,
        status: 'COMPLETED',
        createdAt: dateFilter,
        ...(query.branchId && { branchId: query.branchId }),
      },
      _sum: { amount: true },
      _count: true,
    });

    // Income by method
    const incomeByMethod = await this.prisma.payment.groupBy({
      by: ['method'],
      where: {
        companyId,
        status: 'COMPLETED',
        createdAt: dateFilter,
        ...(query.branchId && { branchId: query.branchId }),
      },
      _sum: { amount: true },
      _count: true,
    });

    // Recognized revenue forecast: for each active contract in scope,
    // estimate monthly recognition from the negotiated contract amount
    // (honors discounts) and the group's weekly cadence. Using contracts
    // instead of enrollments means chegirmali shartnomalar are priced
    // correctly and students without an active contract (test enrollments,
    // incomplete setup) don't inflate the forecast.
    const activeContracts = await this.prisma.contract.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        companyId,
        ...(query.branchId && { branchId: query.branchId }),
        group: {
          deletedAt: null,
          statusEnum: 'ACTIVE',
        },
      },
      select: {
        totalAmount: true,
        course: { select: { lessonPaymentCount: true } },
        group: { select: { exactDays: true } },
      },
    });
    const recognizedRevenueForecast = activeContracts.reduce((sum, c) => {
      const lpc = c.course.lessonPaymentCount || 12;
      const perLesson = Math.round(c.totalAmount / lpc);
      const lessonsPerMonth = (c.group?.exactDays?.length ?? 0) * 4;
      return sum + perLesson * lessonsPerMonth;
    }, 0);
    // Keep `expectedIncome` as an alias for backward compatibility with
    // existing dashboard clients.
    const expectedIncome = recognizedRevenueForecast;

    // Outstanding receivable (D.2): total unpaid balance across active
    // debtors. Not a forecast — it's what the center is actually owed today.
    const receivables = await this.prisma.student.aggregate({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        balance: { lt: 0 },
      },
      _sum: { balance: true },
      _count: true,
    });
    const outstandingReceivable = Math.abs(receivables._sum.balance ?? 0);
    const debtorCount = receivables._count;
    const avgDebt =
      debtorCount > 0 ? Math.round(outstandingReceivable / debtorCount) : 0;

    // Salary: paid + pending. Both are reported on the same basis — net of
    // tax — so the dashboard number reflects what actually leaves (or will
    // leave) the center. Previously paid was net and pending was gross,
    // which made the two rows incomparable and overstated pending.
    const [salaryPaid, salaryPending, companyTax] = await Promise.all([
      this.prisma.salaryPayment.aggregate({
        where: { companyId, status: 'PAID', paidAt: dateFilter },
        _sum: { netAmount: true, grossAmount: true, taxAmount: true },
      }),
      this.prisma.salaryAccrual.aggregate({
        where: { companyId, salaryPaymentId: null },
        _sum: { amount: true },
      }),
      this.prisma.companyTaxConfig.findUnique({
        where: { companyId },
        select: { salaryTaxRate: true, isActive: true },
      }),
    ]);

    const salaryTaxRate =
      companyTax && companyTax.isActive ? companyTax.salaryTaxRate : 12.0;
    const pendingGross = salaryPending._sum.amount ?? 0;
    const pendingTax = Math.round((pendingGross * salaryTaxRate) / 100);
    const pendingNet = pendingGross - pendingTax;

    // Expenses
    const expenses = await this.prisma.expense.aggregate({
      where: {
        companyId,
        deletedAt: null,
        date: { gte: new Date(start), lte: new Date(end) },
        ...(query.branchId && { branchId: query.branchId }),
      },
      _sum: { amount: true },
    });

    // Debtors (students with negative balance)
    const debtors = await this.prisma.student.count({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        balance: { lt: 0 },
      },
    });

    // Active students count + total balance
    const activeStudents = await this.prisma.student.aggregate({
      where: { companyId, deletedAt: null, status: 'ACTIVE' },
      _count: true,
      _sum: { balance: true },
    });

    // Active LTV: period revenue / unique payers in that period.
    // Includes any student who paid during the selected date range,
    // regardless of their current status — a student who was active
    // last month but graduated today still counts when viewing last month.
    const periodPayerFilter = {
      companyId,
      status: 'COMPLETED' as const,
      createdAt: dateFilter,
      ...(query.branchId && { branchId: query.branchId }),
    };
    const [periodPayerIncome, periodUniquePayers] = await Promise.all([
      this.prisma.payment.aggregate({
        where: periodPayerFilter,
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['studentId'],
        where: periodPayerFilter,
      }),
    ]);

    // Marketing expenses (for CAC calculation)
    const marketingExpenses = await this.prisma.expense.aggregate({
      where: {
        companyId,
        deletedAt: null,
        category: 'MARKETING',
        date: { gte: new Date(start), lte: new Date(end) },
        ...(query.branchId && { branchId: query.branchId }),
      },
      _sum: { amount: true },
    });

    // New students this period (for CAC)
    const newStudents = await this.prisma.student.count({
      where: {
        companyId,
        deletedAt: null,
        createdAt: dateFilter,
        ...(query.branchId && {
          branches: { some: { branchId: query.branchId } },
        }),
      },
    });

    const totalIncome = actualIncome._sum.amount ?? 0;
    const totalExpenseAmount = expenses._sum.amount ?? 0;
    const totalSalaryPaid = salaryPaid._sum.netAmount ?? 0;
    const totalExpenses = totalExpenseAmount + totalSalaryPaid;
    const marketingTotal = marketingExpenses._sum.amount ?? 0;
    const periodPayerTotal = periodPayerIncome._sum.amount ?? 0;
    const periodPayerCount = periodUniquePayers.length || 1;
    const activeCount = activeStudents._count || 1;

    return {
      income: {
        expected: expectedIncome,
        actual: totalIncome,
        paymentCount: actualIncome._count,
        byMethod: incomeByMethod.map((m) => ({
          method: m.method,
          amount: m._sum.amount ?? 0,
          count: m._count,
        })),
      },
      forecast: {
        recognizedRevenueForecast,
        outstandingReceivable,
        debtorExposure: { count: debtorCount, avgDebt },
      },
      salary: {
        paid: totalSalaryPaid,
        paidGross: salaryPaid._sum.grossAmount ?? 0,
        paidTax: salaryPaid._sum.taxAmount ?? 0,
        pending: pendingNet,
        pendingGross,
        pendingTax,
      },
      expenses: totalExpenseAmount,
      netProfit: totalIncome - totalExpenses,
      debtorCount: debtors,
      activeBalance: activeStudents._sum.balance ?? 0,
      activeStudentCount: activeStudents._count,
      // Aktiv LTV = tanlangan davrdagi tushum / shu davrdagi noyob to'lovchilar
      ltv: Math.round(periodPayerTotal / periodPayerCount),
      ltvPayerCount: periodUniquePayers.length,
      // CAC = marketing xarajati / yangi o'quvchilar soni
      cac: newStudents > 0 ? Math.round(marketingTotal / newStudents) : 0,
      // Marketing ROI = (tushum - marketing xarajat) / marketing xarajat × 100
      marketingRoi:
        marketingTotal > 0
          ? Math.round(((totalIncome - marketingTotal) / marketingTotal) * 100)
          : 0,
      // O'rtacha to'lov = jami tushum / to'lovlar soni
      avgPayment:
        actualIncome._count > 0
          ? Math.round(totalIncome / actualIncome._count)
          : 0,
      newStudentCount: newStudents,
      marketingExpenses: marketingTotal,
    };
  }

  /**
   * Monthly trend data for the last 6 months — used for KPI card charts.
   */
  async getFinancialTrend(companyId: number, branchId?: number) {
    const now = new Date();
    const months: { label: string; start: Date; end: Date }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(
        d.getFullYear(),
        d.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      months.push({ label, start, end });
    }

    const branchFilter = branchId ? { branchId } : {};

    const result = await Promise.all(
      months.map(async (m) => {
        const dateFilter = { gte: m.start, lte: m.end };

        const [
          income,
          expenseAgg,
          salaryAgg,
          marketing,
          newStudents,
          payerCount,
        ] = await Promise.all([
          this.prisma.payment.aggregate({
            where: {
              companyId,
              status: 'COMPLETED',
              createdAt: dateFilter,
              ...branchFilter,
            },
            _sum: { amount: true },
            _count: true,
          }),
          this.prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              date: { gte: m.start, lte: m.end },
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
          this.prisma.salaryPayment.aggregate({
            where: { companyId, status: 'PAID', paidAt: dateFilter },
            _sum: { netAmount: true },
          }),
          this.prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              category: 'MARKETING',
              date: { gte: m.start, lte: m.end },
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
          this.prisma.student.count({
            where: { companyId, deletedAt: null, createdAt: dateFilter },
          }),
          this.prisma.payment.groupBy({
            by: ['studentId'],
            where: { companyId, status: 'COMPLETED', createdAt: dateFilter },
          }),
        ]);

        const incomeTotal = income._sum.amount ?? 0;
        const expenseTotal = expenseAgg._sum.amount ?? 0;
        const salaryTotal = salaryAgg._sum.netAmount ?? 0;
        const marketingTotal = marketing._sum.amount ?? 0;
        const paymentCount = income._count;

        return {
          month: m.label,
          income: incomeTotal,
          expenses: expenseTotal + salaryTotal,
          profit: incomeTotal - expenseTotal - salaryTotal,
          activeBalance: 0, // snapshot not available per month
          ltv:
            payerCount.length > 0
              ? Math.round(incomeTotal / payerCount.length)
              : 0,
          cac: newStudents > 0 ? Math.round(marketingTotal / newStudents) : 0,
          marketingRoi:
            marketingTotal > 0
              ? Math.round(
                  ((incomeTotal - marketingTotal) / marketingTotal) * 100,
                )
              : 0,
          avgPayment:
            paymentCount > 0 ? Math.round(incomeTotal / paymentCount) : 0,
        };
      }),
    );

    return result;
  }

  private avg(values: (number | null)[]): number {
    const valid = values.filter((v): v is number => v !== null);
    if (valid.length === 0) return 0;
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  }

  // ─── Payment Reports (/reports/payment-reports) ───────────────────

  async getPaymentReports(
    companyId: number,
    options: {
      branchId?: number;
      startDate?: string;
      endDate?: string;
      months?: 3 | 6;
    },
  ) {
    const trendMonths = options.months ?? 6;
    const branchId = options.branchId;
    const branchFilter = branchId ? { branchId } : {};

    const now = new Date();
    const currentStart = options.startDate
      ? new Date(options.startDate + 'T00:00:00.000Z')
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = options.endDate
      ? new Date(options.endDate + 'T23:59:59.999Z')
      : new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        );

    const durationMs = currentEnd.getTime() - currentStart.getTime();
    const previousEnd = new Date(currentStart.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - durationMs);

    const currentPeriod = {
      label: 'current',
      start: currentStart,
      end: currentEnd,
    };
    const previousPeriod = {
      label: 'previous',
      start: previousStart,
      end: previousEnd,
    };
    const trendPeriods = this.buildMonthlyPeriodsEndingAt(
      currentEnd,
      trendMonths,
    );

    const [
      currentMetrics,
      previousMetrics,
      trendMetrics,
      branchBreakdown,
      currentRefundCount,
    ] = await Promise.all([
      this.computePaymentMetricsForPeriod(
        companyId,
        currentPeriod,
        branchFilter,
      ),
      this.computePaymentMetricsForPeriod(
        companyId,
        previousPeriod,
        branchFilter,
      ),
      Promise.all(
        trendPeriods.map((p) =>
          this.computePaymentMetricsForPeriod(companyId, p, branchFilter),
        ),
      ),
      this.computeBranchBreakdown(companyId, currentPeriod),
      this.prisma.refund.count({
        where: {
          companyId,
          status: 'COMPLETED',
          processedAt: { gte: currentStart, lte: currentEnd },
        },
      }),
    ]);

    return {
      totalPayments: {
        current: currentMetrics.totalPayments,
        previous: previousMetrics.totalPayments,
        change: this.percentChange(
          currentMetrics.totalPayments,
          previousMetrics.totalPayments,
        ),
        trend: trendMetrics.map((m) => ({
          month: m.month,
          value: m.totalPayments,
        })),
      },
      onTimePayments: {
        current: {
          total: currentMetrics.paymentCount,
          onTime: currentMetrics.onTimeCount,
          rate: currentMetrics.onTimeRate,
        },
        previous: {
          total: previousMetrics.paymentCount,
          onTime: previousMetrics.onTimeCount,
          rate: previousMetrics.onTimeRate,
        },
        change: this.percentChange(
          currentMetrics.onTimeRate,
          previousMetrics.onTimeRate,
        ),
        trend: trendMetrics.map((m) => ({
          month: m.month,
          onTime: m.onTimeCount,
          late: m.paymentCount - m.onTimeCount,
          rate: m.onTimeRate,
        })),
      },
      branchBreakdown: {
        current: currentMetrics.totalPayments,
        previous: previousMetrics.totalPayments,
        change: this.percentChange(
          currentMetrics.totalPayments,
          previousMetrics.totalPayments,
        ),
        byBranch: branchBreakdown,
        trend: trendMetrics.map((m) => ({
          month: m.month,
          value: m.totalPayments,
        })),
      },
      refunds: {
        current: currentMetrics.refunds,
        previous: previousMetrics.refunds,
        change: this.percentChange(
          currentMetrics.refunds,
          previousMetrics.refunds,
        ),
        count: currentRefundCount,
        trend: trendMetrics.map((m) => ({
          month: m.month,
          value: m.refunds,
        })),
      },
    };
  }

  private buildMonthlyPeriodsEndingAt(anchor: Date, count: number) {
    const periods: { label: string; start: Date; end: Date }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(
        d.getFullYear(),
        d.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      periods.push({ label, start, end });
    }
    return periods;
  }

  private async computePaymentMetricsForPeriod(
    companyId: number,
    period: { label: string; start: Date; end: Date },
    branchFilter: { branchId?: number },
  ) {
    const dateFilter = { gte: period.start, lte: period.end };

    const [paymentsAgg, payments, refundsAgg] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: dateFilter,
          ...branchFilter,
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.findMany({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: dateFilter,
          ...branchFilter,
        },
        select: {
          id: true,
          studentId: true,
          createdAt: true,
          contractId: true,
          contract: {
            select: {
              groupId: true,
              course: { select: { lessonPaymentCount: true } },
            },
          },
        },
      }),
      this.prisma.refund.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          processedAt: dateFilter,
        },
        _sum: { approvedAmount: true },
      }),
    ]);

    const onTimeResults = await Promise.all(
      payments.map((p) => this.isPaymentOnTime(p)),
    );
    const onTimeCount = onTimeResults.filter((r) => r === true).length;
    const paymentCount = payments.length;

    return {
      month: period.label,
      totalPayments: paymentsAgg._sum.amount ?? 0,
      paymentCount,
      onTimeCount,
      onTimeRate:
        paymentCount > 0 ? Math.round((onTimeCount / paymentCount) * 100) : 0,
      refunds: refundsAgg._sum.approvedAmount ?? 0,
    };
  }

  private async computeBranchBreakdown(
    companyId: number,
    period: { start: Date; end: Date },
  ) {
    const [grouped, branches] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['branchId'],
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: period.start, lte: period.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.branch.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    const byBranch = branches.map((b) => {
      const match = grouped.find((g) => g.branchId === b.id);
      return {
        branchId: b.id,
        branchName: b.name,
        amount: match?._sum.amount ?? 0,
      };
    });

    return byBranch.sort((a, b) => b.amount - a.amount);
  }

  /**
   * On-time payment rule (v1):
   * - If the group has had ≤3 attendance records total by payment date → on-time (new group).
   * - Else, check the student's attended lessons in that group BEFORE the payment:
   *   if (lessons % lessonPaymentCount) === 0 → on-time (new cycle starts).
   * - Payments without a resolvable group/course are skipped (returns null).
   */
  async isPaymentOnTime(payment: {
    studentId: number;
    createdAt: Date;
    contractId: string | null;
    contract: {
      groupId: string | null;
      course: { lessonPaymentCount: number };
    } | null;
  }): Promise<boolean | null> {
    let groupId = payment.contract?.groupId ?? null;
    let lessonPaymentCount =
      payment.contract?.course.lessonPaymentCount ?? null;

    if (!groupId || !lessonPaymentCount) {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          studentId: payment.studentId,
          deletedAt: null,
          status: { in: ['ACTIVE', 'FROZEN'] },
        },
        select: {
          groupId: true,
          group: { select: { course: { select: { lessonPaymentCount: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!enrollment) return null;
      groupId = enrollment.groupId;
      lessonPaymentCount = enrollment.group.course.lessonPaymentCount;
    }

    const [groupLessonsTotal, studentLessonsBefore] = await Promise.all([
      this.prisma.attendance.count({
        where: { groupId, date: { lte: payment.createdAt } },
      }),
      this.prisma.attendance.count({
        where: {
          groupId,
          studentId: payment.studentId,
          date: { lt: payment.createdAt },
        },
      }),
    ]);

    if (groupLessonsTotal <= 3) return true;
    return studentLessonsBefore % lessonPaymentCount === 0;
  }

  private percentChange(current: number, previous: number): number {
    if (previous === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - previous) / previous) * 100);
  }

  // ─── Teacher Payment Reports ──────────────────────────────────────

  private resolveRange(startDate?: string, endDate?: string) {
    const now = new Date();
    const start = startDate
      ? new Date(startDate + 'T00:00:00.000Z')
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate
      ? new Date(endDate + 'T23:59:59.999Z')
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  async getTeacherPaymentReports(
    companyId: number,
    options: { branchId?: number; startDate?: string; endDate?: string },
  ) {
    const range = this.resolveRange(options.startDate, options.endDate);
    const branchFilter = options.branchId ? { branchId: options.branchId } : {};

    const teachers = await this.prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        roles: { some: { roleId: 4 } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        groupTeachers: {
          where: {
            group: { deletedAt: null, ...branchFilter },
          },
          select: {
            group: {
              select: {
                id: true,
                course: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const allGroupIds = Array.from(
      new Set(
        teachers.flatMap((t) => t.groupTeachers.map((gt) => gt.group.id)),
      ),
    );

    if (allGroupIds.length === 0) {
      return { teachers: [] };
    }

    const [enrollmentsByGroup, payments, debtorStudents] = await Promise.all([
      this.prisma.enrollment.groupBy({
        by: ['groupId'],
        where: {
          groupId: { in: allGroupIds },
          deletedAt: null,
          status: { in: ['ACTIVE', 'FROZEN'] },
        },
        _count: { _all: true },
      }),
      this.prisma.payment.findMany({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: range.start, lte: range.end },
          contract: { groupId: { in: allGroupIds } },
        },
        select: {
          amount: true,
          contract: { select: { groupId: true } },
        },
      }),
      this.prisma.student.findMany({
        where: {
          companyId,
          deletedAt: null,
          balance: { lt: 0 },
          enrollments: {
            some: {
              groupId: { in: allGroupIds },
              deletedAt: null,
              status: { in: ['ACTIVE', 'FROZEN'] },
            },
          },
        },
        select: {
          balance: true,
          enrollments: {
            where: {
              groupId: { in: allGroupIds },
              deletedAt: null,
              status: { in: ['ACTIVE', 'FROZEN'] },
            },
            select: { groupId: true },
          },
        },
      }),
    ]);

    const studentCountByGroup = new Map<string, number>(
      enrollmentsByGroup.map((e) => [e.groupId, e._count._all]),
    );

    const paymentsByGroup = new Map<string, number>();
    for (const p of payments) {
      const gid = p.contract?.groupId;
      if (gid) {
        paymentsByGroup.set(gid, (paymentsByGroup.get(gid) ?? 0) + p.amount);
      }
    }

    const debtByGroup = new Map<string, number>();
    for (const s of debtorStudents) {
      for (const e of s.enrollments) {
        debtByGroup.set(
          e.groupId,
          (debtByGroup.get(e.groupId) ?? 0) + Math.abs(s.balance),
        );
      }
    }

    const result = teachers
      .map((t) => {
        const groupIds = t.groupTeachers.map((gt) => gt.group.id);
        const courses = Array.from(
          new Set(t.groupTeachers.map((gt) => gt.group.course.name)),
        );
        const studentCount = groupIds.reduce(
          (acc, gid) => acc + (studentCountByGroup.get(gid) ?? 0),
          0,
        );
        const totalPayments = groupIds.reduce(
          (acc, gid) => acc + (paymentsByGroup.get(gid) ?? 0),
          0,
        );
        const debtAmount = groupIds.reduce(
          (acc, gid) => acc + (debtByGroup.get(gid) ?? 0),
          0,
        );
        return {
          id: t.id,
          name: `${t.firstName} ${t.lastName}`,
          groupCount: groupIds.length,
          courses,
          studentCount,
          totalPayments,
          debtAmount,
        };
      })
      .filter((t) => t.groupCount > 0)
      .sort((a, b) => b.totalPayments - a.totalPayments);

    return { teachers: result };
  }

  async getTeacherGroupsReport(
    companyId: number,
    teacherId: number,
    options: { branchId?: number; startDate?: string; endDate?: string },
  ) {
    const range = this.resolveRange(options.startDate, options.endDate);
    const branchFilter = options.branchId ? { branchId: options.branchId } : {};

    const teacher = await this.prisma.user.findFirst({
      where: { id: teacherId, companyId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!teacher) {
      throw new NotFoundException("O'qituvchi topilmadi");
    }

    const groupTeachers = await this.prisma.groupTeacher.findMany({
      where: {
        teacherId,
        group: { deletedAt: null, ...branchFilter },
      },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            course: { select: { price: true } },
          },
        },
      },
    });

    const groups = groupTeachers.map((gt) => gt.group);
    const groupIds = groups.map((g) => g.id);

    if (groupIds.length === 0) {
      return {
        teacher: {
          id: teacher.id,
          name: `${teacher.firstName} ${teacher.lastName}`,
        },
        groups: [],
      };
    }

    const [enrollments, payments, debtorStudents] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: {
          groupId: { in: groupIds },
          deletedAt: null,
          status: { in: ['ACTIVE', 'FROZEN'] },
        },
        select: { groupId: true, studentId: true },
      }),
      this.prisma.payment.findMany({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: range.start, lte: range.end },
          contract: { groupId: { in: groupIds } },
        },
        select: {
          amount: true,
          studentId: true,
          contract: { select: { groupId: true } },
        },
      }),
      this.prisma.student.findMany({
        where: {
          companyId,
          deletedAt: null,
          balance: { lt: 0 },
          enrollments: {
            some: {
              groupId: { in: groupIds },
              deletedAt: null,
              status: { in: ['ACTIVE', 'FROZEN'] },
            },
          },
        },
        select: {
          balance: true,
          enrollments: {
            where: {
              groupId: { in: groupIds },
              deletedAt: null,
              status: { in: ['ACTIVE', 'FROZEN'] },
            },
            select: { groupId: true },
          },
        },
      }),
    ]);

    const studentsByGroup = new Map<string, Set<number>>();
    for (const e of enrollments) {
      if (!studentsByGroup.has(e.groupId)) {
        studentsByGroup.set(e.groupId, new Set());
      }
      studentsByGroup.get(e.groupId)!.add(e.studentId);
    }

    const paymentSumByGroup = new Map<string, number>();
    const paidStudentsByGroup = new Map<string, Set<number>>();
    for (const p of payments) {
      const gid = p.contract?.groupId;
      if (!gid) continue;
      paymentSumByGroup.set(
        gid,
        (paymentSumByGroup.get(gid) ?? 0) + p.amount,
      );
      if (!paidStudentsByGroup.has(gid)) {
        paidStudentsByGroup.set(gid, new Set());
      }
      paidStudentsByGroup.get(gid)!.add(p.studentId);
    }

    const debtByGroup = new Map<string, { count: number; sum: number }>();
    for (const s of debtorStudents) {
      for (const e of s.enrollments) {
        const cur = debtByGroup.get(e.groupId) ?? { count: 0, sum: 0 };
        cur.count += 1;
        cur.sum += Math.abs(s.balance);
        debtByGroup.set(e.groupId, cur);
      }
    }

    const result = groups
      .map((g) => {
        const totalStudents = studentsByGroup.get(g.id)?.size ?? 0;
        const paidCount = paidStudentsByGroup.get(g.id)?.size ?? 0;
        const debt = debtByGroup.get(g.id) ?? { count: 0, sum: 0 };
        const totalPayments = paymentSumByGroup.get(g.id) ?? 0;
        return {
          id: g.id,
          name: g.name,
          coursePrice: g.course.price,
          totalStudents,
          paidCount,
          debtorCount: debt.count,
          totalPayments,
          debtAmount: debt.sum,
          expectedAmount: totalStudents * g.course.price,
        };
      })
      .sort((a, b) => b.totalPayments - a.totalPayments);

    return {
      teacher: {
        id: teacher.id,
        name: `${teacher.firstName} ${teacher.lastName}`,
      },
      groups: result,
    };
  }

  // ─── Student Payments Report ──────────────────────────────────────

  async getStudentPaymentsReport(
    companyId: number,
    params: {
      branchId?: number;
      groupIds?: string[];
      teacherIds?: number[];
      methods?: ('CASH' | 'PAYME' | 'CLICK' | 'UZUM' | 'TRANSFER')[];
      courseId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10));

    const where: any = {
      companyId,
      status: 'COMPLETED' as const,
    };

    if (params.branchId !== undefined) {
      where.branchId = params.branchId;
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) {
        const end = new Date(params.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (params.methods && params.methods.length > 0) {
      where.method = { in: params.methods };
    }

    if (params.courseId) {
      where.contract = { courseId: params.courseId };
    }

    if (params.groupIds && params.groupIds.length > 0) {
      where.OR = [
        { contract: { groupId: { in: params.groupIds } } },
        {
          student: {
            enrollments: {
              some: {
                groupId: { in: params.groupIds },
                status: 'ACTIVE',
                deletedAt: null,
              },
            },
          },
        },
      ];
    }

    if (params.teacherIds && params.teacherIds.length > 0) {
      const teacherCondition = [
        {
          contract: {
            group: {
              teachers: { some: { teacherId: { in: params.teacherIds } } },
            },
          },
        },
        {
          student: {
            enrollments: {
              some: {
                status: 'ACTIVE',
                deletedAt: null,
                group: {
                  teachers: {
                    some: { teacherId: { in: params.teacherIds } },
                  },
                },
              },
            },
          },
        },
      ];
      // If groupIds already set OR, intersect with AND + nested OR.
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: teacherCondition }];
        delete where.OR;
      } else {
        where.OR = teacherCondition;
      }
    }

    const [payments, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          amount: true,
          method: true,
          note: true,
          createdAt: true,
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
          receivedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          contract: {
            select: {
              group: {
                select: {
                  id: true,
                  name: true,
                  teachers: {
                    select: {
                      teacher: {
                        select: {
                          id: true,
                          firstName: true,
                          lastName: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    // Fallback: for payments without a contract group, derive group/teachers
    // from the student's active enrollment. Batched to avoid N+1.
    const studentIdsNeedingFallback = payments
      .filter((p) => !p.contract?.group)
      .map((p) => p.student.id);

    let fallbackByStudentId: Map<
      number,
      {
        group: { id: string; name: string };
        teachers: { id: number; firstName: string; lastName: string }[];
      } | null
    > = new Map();

    if (studentIdsNeedingFallback.length > 0) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          studentId: { in: studentIdsNeedingFallback },
          status: 'ACTIVE',
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          studentId: true,
          group: {
            select: {
              id: true,
              name: true,
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
      for (const e of enrollments) {
        if (!fallbackByStudentId.has(e.studentId)) {
          fallbackByStudentId.set(e.studentId, {
            group: { id: e.group.id, name: e.group.name },
            teachers: e.group.teachers.map((t) => t.teacher),
          });
        }
      }
    }

    const data = payments.map((p) => {
      const contractGroup = p.contract?.group;
      const fallback = fallbackByStudentId.get(p.student.id) ?? null;
      const group = contractGroup
        ? { id: contractGroup.id, name: contractGroup.name }
        : (fallback?.group ?? null);
      const teachers = contractGroup
        ? contractGroup.teachers.map((t) => ({
            id: t.teacher.id,
            fullName: `${t.teacher.firstName} ${t.teacher.lastName}`,
          }))
        : (fallback?.teachers.map((t) => ({
            id: t.id,
            fullName: `${t.firstName} ${t.lastName}`,
          })) ?? []);

      return {
        id: p.id,
        student: {
          id: p.student.id,
          fullName: `${p.student.firstName} ${p.student.lastName}`,
        },
        group,
        teachers,
        amount: p.amount,
        bonus: null,
        paymentDate: p.createdAt.toISOString(),
        note: p.note,
        receivedBy: p.receivedBy
          ? {
              id: p.receivedBy.id,
              fullName: `${p.receivedBy.firstName} ${p.receivedBy.lastName}`,
            }
          : null,
        method: p.method,
      };
    });

    return { data, total, page, pageSize };
  }

  async getStudentPaymentsFilterOptions(companyId: number) {
    const [groups, teachers, courses] = await Promise.all([
      this.prisma.group.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, branchId: true },
      }),
      this.prisma.user.findMany({
        where: {
          companyId,
          deletedAt: null,
          roles: { some: { role: { name: 'Teacher' } } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.course.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);

    return {
      groups,
      teachers: teachers.map((t) => ({
        id: t.id,
        fullName: `${t.firstName} ${t.lastName}`,
      })),
      courses,
    };
  }
}
