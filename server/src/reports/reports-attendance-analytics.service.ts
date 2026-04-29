import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ReportsQueryDto } from './dto/reports-query.dto';
import {
  AttendanceAnalyticsQueryDto,
  AttendanceByCourseQueryDto,
  AttendanceByGroupQueryDto,
  AttendanceTeacherPerfQueryDto,
} from './dto/attendance-reports-query.dto';

const MONTH_LABELS_UZ = [
  'Yan',
  'Fev',
  'Mar',
  'Apr',
  'May',
  'Iyn',
  'Iyl',
  'Avg',
  'Sen',
  'Okt',
  'Noy',
  'Dek',
];

@Injectable()
export class ReportsAttendanceAnalyticsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getTeacherPerformance(
    companyId: number,
    query: AttendanceTeacherPerfQueryDto,
  ) {
    const sortBy = query.sortBy ?? 'rate';
    const sortOrder = query.sortOrder ?? 'desc';
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const cacheKey = `reports:teacher-perf:${companyId}:${query.branchId || 'all'}:${query.startDate || ''}:${query.endDate || ''}:${sortBy}:${sortOrder}:${page}:${pageSize}`;
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

    const allTeachers = [...teacherMap.values()].map((t) => {
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
        totalStudents: t.totalEnrolled,
        averageAttendance,
        averageFillRate,
      };
    });

    const orderMul = sortOrder === 'asc' ? 1 : -1;
    allTeachers.sort((a, b) => {
      if (sortBy === 'groupsCount') {
        return (a.groupsCount - b.groupsCount) * orderMul;
      }
      // 'rate' default — null treated as -1 so it sinks to bottom on desc
      const av = a.averageAttendance ?? -1;
      const bv = b.averageAttendance ?? -1;
      return (av - bv) * orderMul;
    });

    const total = allTeachers.length;
    const teachers = allTeachers.slice((page - 1) * pageSize, page * pageSize);

    const result = { teachers, total, page, pageSize };
    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

  async getAttendanceAnalytics(
    companyId: number,
    query: AttendanceAnalyticsQueryDto,
  ) {
    const bucket = query.bucket ?? 'week';

    const cacheKey = `reports:attendance-analytics:${companyId}:${query.branchId || 'all'}:${query.startDate || ''}:${query.endDate || ''}:${bucket}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

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
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let excusedCount = 0;

    const bucketMap = new Map<
      string,
      { total: number; presentLate: number; bucketStart: string }
    >();
    const dayMap = new Map<number, { total: number; presentLate: number }>();

    for (const row of attendanceData) {
      const count = row._count.id;
      const isPresentLate = row.status === 'PRESENT' || row.status === 'LATE';

      totalAll += count;
      if (isPresentLate) totalPresentLate += count;
      if (row.status === 'PRESENT') presentCount += count;
      else if (row.status === 'ABSENT') absentCount += count;
      else if (row.status === 'LATE') lateCount += count;
      else if (row.status === 'EXCUSED') excusedCount += count;

      const { key, sortStart } = this.bucketKey(row.date, bucket);
      const slot = bucketMap.get(key) || {
        total: 0,
        presentLate: 0,
        bucketStart: sortStart,
      };
      slot.total += count;
      if (isPresentLate) slot.presentLate += count;
      bucketMap.set(key, slot);

      const day = row.date.getDay();
      const dayEntry = dayMap.get(day) || { total: 0, presentLate: 0 };
      dayEntry.total += count;
      if (isPresentLate) dayEntry.presentLate += count;
      dayMap.set(day, dayEntry);
    }

    const overallRate =
      totalAll > 0 ? Math.round((totalPresentLate / totalAll) * 100) : 0;

    const trend = [...bucketMap.entries()]
      .sort(([, a], [, b]) => a.bucketStart.localeCompare(b.bucketStart))
      .map(([label, data]) => ({
        bucketStart: data.bucketStart,
        label,
        rate: Math.round((data.presentLate / data.total) * 100),
        total: data.total,
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
    // Re-order so Monday (1) is first, Sunday (0) last — matches Uzbek week order
    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    const byDayOfWeek = dayOrder
      .filter((d) => dayMap.has(d))
      .map((d) => {
        const data = dayMap.get(d)!;
        return {
          day: dayNames[d],
          rate: Math.round((data.presentLate / data.total) * 100),
        };
      });

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

    const ranked = [...groupRateMap.entries()]
      .filter(([, data]) => data.total > 0)
      .map(([groupId, data]) => ({
        groupId,
        rate: Math.round((data.presentLate / data.total) * 100),
        total: data.total,
      }));

    const worstSlice = [...ranked].sort((a, b) => a.rate - b.rate).slice(0, 5);
    const bestSlice = [...ranked].sort((a, b) => b.rate - a.rate).slice(0, 5);

    const allRankedIds = [
      ...new Set([
        ...worstSlice.map((g) => g.groupId),
        ...bestSlice.map((g) => g.groupId),
      ]),
    ];

    const groupNames =
      allRankedIds.length > 0
        ? await this.prisma.group.findMany({
            where: { id: { in: allRankedIds } },
            select: { id: true, name: true },
          })
        : [];

    const nameMap = new Map(groupNames.map((g) => [g.id, g.name]));

    const worstGroups = worstSlice.map((g) => ({
      groupId: g.groupId,
      groupName: nameMap.get(g.groupId) ?? '',
      rate: g.rate,
    }));
    const bestGroups = bestSlice.map((g) => ({
      groupId: g.groupId,
      groupName: nameMap.get(g.groupId) ?? '',
      rate: g.rate,
    }));

    const result = {
      overallRate,
      statusBreakdown: {
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        excused: excusedCount,
        total: totalAll,
      },
      bucket,
      trend,
      byDayOfWeek,
      worstGroups,
      bestGroups,
    };

    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

  async getAttendanceByGroup(
    companyId: number,
    query: AttendanceByGroupQueryDto,
  ) {
    const sortBy = query.sortBy ?? 'rate';
    const sortOrder = query.sortOrder ?? 'asc';
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const cacheKey = `reports:attendance-by-group:${companyId}:${query.branchId || 'all'}:${query.startDate || ''}:${query.endDate || ''}:${query.courseId || 'all'}:${query.teacherId || 'all'}:${sortBy}:${sortOrder}:${page}:${pageSize}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const groupWhere: any = {
      companyId,
      deletedAt: null,
      statusEnum: { in: ['ACTIVE', 'FORMING', 'COMPLETED'] },
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.teacherId
        ? { teachers: { some: { teacherId: query.teacherId } } }
        : {}),
    };

    const groups = await this.prisma.group.findMany({
      where: groupWhere,
      select: {
        id: true,
        name: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
        courseId: true,
        course: { select: { id: true, name: true } },
        teachers: {
          select: {
            teacher: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        enrollments: {
          where: { status: 'ACTIVE', deletedAt: null },
          select: { id: true },
        },
      },
    });

    if (groups.length === 0) {
      const empty = { groups: [], total: 0, page, pageSize };
      await this.redis.setex(cacheKey, 300, JSON.stringify(empty));
      return empty;
    }

    const groupIds = groups.map((g) => g.id);
    const dateFilter = this.buildDateFilter(query);

    const attendance = await this.prisma.attendance.groupBy({
      by: ['groupId', 'status'],
      where: {
        companyId,
        groupId: { in: groupIds },
        ...dateFilter,
      },
      _count: { id: true },
    });

    const lessonCounts = await this.prisma.attendance.groupBy({
      by: ['groupId', 'date'],
      where: {
        companyId,
        groupId: { in: groupIds },
        ...dateFilter,
      },
    });

    const attMap = new Map<
      string,
      {
        total: number;
        presentLate: number;
        present: number;
        absent: number;
        late: number;
        excused: number;
      }
    >();
    for (const row of attendance) {
      const e = attMap.get(row.groupId) || {
        total: 0,
        presentLate: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      };
      const c = row._count.id;
      e.total += c;
      if (row.status === 'PRESENT') {
        e.present += c;
        e.presentLate += c;
      } else if (row.status === 'ABSENT') {
        e.absent += c;
      } else if (row.status === 'LATE') {
        e.late += c;
        e.presentLate += c;
      } else if (row.status === 'EXCUSED') {
        e.excused += c;
      }
      attMap.set(row.groupId, e);
    }

    const lessonsMap = new Map<string, number>();
    for (const row of lessonCounts) {
      lessonsMap.set(row.groupId, (lessonsMap.get(row.groupId) ?? 0) + 1);
    }

    const enriched = groups.map((g) => {
      const a = attMap.get(g.id);
      const total = a?.total ?? 0;
      const attendanceRate =
        total > 0 ? Math.round(((a?.presentLate ?? 0) / total) * 100) : 0;
      return {
        groupId: g.id,
        groupName: g.name,
        branchId: g.branchId,
        branchName: g.branch?.name ?? '',
        courseId: g.courseId,
        courseName: g.course?.name ?? '',
        teachers: g.teachers.map((t) => ({
          id: t.teacher.id,
          firstName: t.teacher.firstName,
          lastName: t.teacher.lastName,
        })),
        studentCount: g.enrollments.length,
        lessonCount: lessonsMap.get(g.id) ?? 0,
        attendanceRate,
        present: a?.present ?? 0,
        absent: a?.absent ?? 0,
        late: a?.late ?? 0,
        excused: a?.excused ?? 0,
      };
    });

    const orderMul = sortOrder === 'asc' ? 1 : -1;
    enriched.sort((a, b) => {
      if (sortBy === 'studentCount') {
        return (a.studentCount - b.studentCount) * orderMul;
      }
      if (sortBy === 'lessonCount') {
        return (a.lessonCount - b.lessonCount) * orderMul;
      }
      return (a.attendanceRate - b.attendanceRate) * orderMul;
    });

    const total = enriched.length;
    const paged = enriched.slice((page - 1) * pageSize, page * pageSize);

    const result = { groups: paged, total, page, pageSize };
    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

  async getAttendanceByCourse(
    companyId: number,
    query: AttendanceByCourseQueryDto,
  ) {
    const cacheKey = `reports:attendance-by-course:${companyId}:${query.branchId || 'all'}:${query.startDate || ''}:${query.endDate || ''}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const groupWhere: any = {
      companyId,
      deletedAt: null,
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };

    const groups = await this.prisma.group.findMany({
      where: groupWhere,
      select: {
        id: true,
        courseId: true,
        course: { select: { id: true, name: true } },
        enrollments: {
          where: { status: 'ACTIVE', deletedAt: null },
          select: { id: true },
        },
      },
    });

    if (groups.length === 0) {
      const empty = { courses: [] };
      await this.redis.setex(cacheKey, 300, JSON.stringify(empty));
      return empty;
    }

    const groupIds = groups.map((g) => g.id);
    const dateFilter = this.buildDateFilter(query);

    const attendance = await this.prisma.attendance.groupBy({
      by: ['groupId', 'status'],
      where: {
        companyId,
        groupId: { in: groupIds },
        ...dateFilter,
      },
      _count: { id: true },
    });

    const lessonCounts = await this.prisma.attendance.groupBy({
      by: ['groupId', 'date'],
      where: {
        companyId,
        groupId: { in: groupIds },
        ...dateFilter,
      },
    });

    type CourseAcc = {
      courseId: string;
      courseName: string;
      groupCount: number;
      studentCount: number;
      lessonCount: number;
      total: number;
      presentLate: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
    };

    const courseMap = new Map<string, CourseAcc>();
    const groupToCourse = new Map<string, string>();

    for (const g of groups) {
      const courseId = g.courseId;
      groupToCourse.set(g.id, courseId);
      let acc = courseMap.get(courseId);
      if (!acc) {
        acc = {
          courseId,
          courseName: g.course?.name ?? '',
          groupCount: 0,
          studentCount: 0,
          lessonCount: 0,
          total: 0,
          presentLate: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
        };
        courseMap.set(courseId, acc);
      }
      acc.groupCount += 1;
      acc.studentCount += g.enrollments.length;
    }

    for (const row of lessonCounts) {
      const courseId = groupToCourse.get(row.groupId);
      if (!courseId) continue;
      const acc = courseMap.get(courseId);
      if (acc) acc.lessonCount += 1;
    }

    for (const row of attendance) {
      const courseId = groupToCourse.get(row.groupId);
      if (!courseId) continue;
      const acc = courseMap.get(courseId);
      if (!acc) continue;
      const c = row._count.id;
      acc.total += c;
      if (row.status === 'PRESENT') {
        acc.present += c;
        acc.presentLate += c;
      } else if (row.status === 'ABSENT') {
        acc.absent += c;
      } else if (row.status === 'LATE') {
        acc.late += c;
        acc.presentLate += c;
      } else if (row.status === 'EXCUSED') {
        acc.excused += c;
      }
    }

    const courses = [...courseMap.values()]
      .map((acc) => ({
        courseId: acc.courseId,
        courseName: acc.courseName,
        groupCount: acc.groupCount,
        studentCount: acc.studentCount,
        lessonCount: acc.lessonCount,
        attendanceRate:
          acc.total > 0 ? Math.round((acc.presentLate / acc.total) * 100) : 0,
        present: acc.present,
        absent: acc.absent,
        late: acc.late,
        excused: acc.excused,
      }))
      .sort((a, b) => a.attendanceRate - b.attendanceRate);

    const result = { courses };
    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
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
      },
      select: { id: true },
    });
    return groups.map((g) => g.id);
  }

  private bucketKey(
    date: Date,
    bucket: 'week' | 'month',
  ): { key: string; sortStart: string } {
    if (bucket === 'month') {
      const year = date.getFullYear();
      const month = date.getMonth();
      const label = `${MONTH_LABELS_UZ[month]} ${year}`;
      const sortStart = `${year}-${String(month + 1).padStart(2, '0')}`;
      return { key: label, sortStart };
    }
    // week
    const isoWeek = this.getISOWeek(date);
    return { key: isoWeek, sortStart: isoWeek };
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
