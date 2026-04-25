import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ReportsQueryDto } from './dto/reports-query.dto';

@Injectable()
export class ReportsAttendanceAnalyticsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

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

    teachers.sort(
      (a, b) => (b.averageAttendance ?? 0) - (a.averageAttendance ?? 0),
    );

    const result = { teachers };
    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

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

    let totalAll = 0;
    let totalPresentLate = 0;

    const weekMap = new Map<string, { total: number; presentLate: number }>();
    const dayMap = new Map<number, { total: number; presentLate: number }>();

    for (const row of attendanceData) {
      const count = row._count.id;
      const isPresentLate = row.status === 'PRESENT' || row.status === 'LATE';

      totalAll += count;
      if (isPresentLate) totalPresentLate += count;

      const weekKey = this.getISOWeek(row.date);
      const week = weekMap.get(weekKey) || { total: 0, presentLate: 0 };
      week.total += count;
      if (isPresentLate) week.presentLate += count;
      weekMap.set(weekKey, week);

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
}
