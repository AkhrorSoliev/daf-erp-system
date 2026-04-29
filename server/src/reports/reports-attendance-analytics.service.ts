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

    const cacheKey = `reports:teacher-perf:v2:${companyId}:${query.branchId || 'all'}:${query.startDate || ''}:${query.endDate || ''}:${sortBy}:${sortOrder}:${page}:${pageSize}`;
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
          totalCapacity: 0,
          groupsWithCapacity: 0,
        };
        teacherMap.set(gt.teacherId, t);
      }
      t.groupIds.push(gt.groupId);
      if (gt.group.room?.capacity) {
        t.totalCapacity += gt.group.room.capacity;
        t.groupsWithCapacity++;
      }
    }

    const allGroupIds = [...new Set(groupTeachers.map((gt) => gt.groupId))];

    const dateFilter = this.buildDateFilter(query);
    const period = this.resolvePeriod(query);

    const [attendanceByGroup, enrollmentSnapshots] = await Promise.all([
      allGroupIds.length > 0
        ? this.prisma.attendance.groupBy({
            by: ['groupId', 'status'],
            where: {
              companyId,
              groupId: { in: allGroupIds },
              ...dateFilter,
            },
            _count: { id: true },
          })
        : Promise.resolve([]),
      this.loadEnrollmentsForCounts(companyId, allGroupIds),
    ]);

    const startCounts = this.countActiveByGroupAt(
      enrollmentSnapshots,
      period.start,
    );
    const endCounts = this.countActiveByGroupAt(
      enrollmentSnapshots,
      period.end,
    );

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
      let startStudentCount = 0;
      let endStudentCount = 0;
      for (const gid of t.groupIds) {
        const att = attMap.get(gid);
        if (att) {
          totalAtt += att.total;
          totalPresentLate += att.presentLate;
        }
        startStudentCount += startCounts.get(gid) ?? 0;
        endStudentCount += endCounts.get(gid) ?? 0;
      }

      const averageAttendance =
        totalAtt > 0 ? Math.round((totalPresentLate / totalAtt) * 100) : null;

      const averageFillRate =
        t.groupsWithCapacity > 0
          ? Math.round((endStudentCount / t.totalCapacity) * 100)
          : null;

      return {
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        photo: t.photo,
        groupsCount: t.groupIds.length,
        totalStudents: endStudentCount,
        startStudentCount,
        endStudentCount,
        retentionPct: this.computeRetentionPct(
          startStudentCount,
          endStudentCount,
        ),
        averageAttendance,
        averageFillRate,
      };
    });

    const orderMul = sortOrder === 'asc' ? 1 : -1;
    const nullRetentionSinkValue = sortOrder === 'asc' ? Infinity : -Infinity;
    allTeachers.sort((a, b) => {
      if (sortBy === 'groupsCount') {
        return (a.groupsCount - b.groupsCount) * orderMul;
      }
      if (sortBy === 'retention') {
        const av = a.retentionPct ?? nullRetentionSinkValue;
        const bv = b.retentionPct ?? nullRetentionSinkValue;
        return (av - bv) * orderMul;
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

    const cacheKey = `reports:attendance-analytics:v3:${companyId}:${query.branchId || 'all'}:${query.startDate || ''}:${query.endDate || ''}:${bucket}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const dateFilter = this.buildDateFilter(query);
    const period = this.resolvePeriod(query);
    const branchGroupIds = await this.getBranchGroupIds(
      companyId,
      query.branchId,
    );
    const groupIdFilter = branchGroupIds
      ? { groupId: { in: branchGroupIds } }
      : {};

    // For retention math: load all enrollment snapshots for branch-scoped
    // groups (or all company groups when no branch filter).
    const retentionGroupIds =
      branchGroupIds ??
      (
        await this.prisma.group.findMany({
          where: { companyId, deletedAt: null },
          select: { id: true },
        })
      ).map((g) => g.id);
    const enrollmentSnapshots = await this.loadEnrollmentsForCounts(
      companyId,
      retentionGroupIds,
    );

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
      {
        total: number;
        presentLate: number;
        bucketStart: string;
        displayLabel: string;
        rangeStart: Date;
        rangeEnd: Date;
      }
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

      const { key, sortStart, displayLabel } = this.bucketKey(row.date, bucket);
      let slot = bucketMap.get(key);
      if (!slot) {
        const range = this.bucketBoundaries(row.date, bucket);
        slot = {
          total: 0,
          presentLate: 0,
          bucketStart: sortStart,
          displayLabel,
          rangeStart: range.start,
          rangeEnd: range.end,
        };
        bucketMap.set(key, slot);
      }
      slot.total += count;
      if (isPresentLate) slot.presentLate += count;

      const day = row.date.getDay();
      const dayEntry = dayMap.get(day) || { total: 0, presentLate: 0 };
      dayEntry.total += count;
      if (isPresentLate) dayEntry.presentLate += count;
      dayMap.set(day, dayEntry);
    }

    const overallRate =
      totalAll > 0 ? Math.round((totalPresentLate / totalAll) * 100) : 0;

    // Company-wide retention across the entire period
    const overallStartCount = [
      ...this.countActiveByGroupAt(enrollmentSnapshots, period.start).values(),
    ].reduce((s, n) => s + n, 0);
    const overallEndCount = [
      ...this.countActiveByGroupAt(enrollmentSnapshots, period.end).values(),
    ].reduce((s, n) => s + n, 0);
    const overallRetention = this.computeRetentionPct(
      overallStartCount,
      overallEndCount,
    );

    const trend = [...bucketMap.entries()]
      .sort(([, a], [, b]) => a.bucketStart.localeCompare(b.bucketStart))
      .map(([, data]) => {
        const startCount = [
          ...this.countActiveByGroupAt(
            enrollmentSnapshots,
            data.rangeStart,
          ).values(),
        ].reduce((s, n) => s + n, 0);
        const endCount = [
          ...this.countActiveByGroupAt(
            enrollmentSnapshots,
            data.rangeEnd,
          ).values(),
        ].reduce((s, n) => s + n, 0);
        return {
          bucketStart: data.bucketStart,
          label: data.displayLabel,
          rate: Math.round((data.presentLate / data.total) * 100),
          total: data.total,
          retentionPct: this.computeRetentionPct(startCount, endCount),
        };
      });

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

    // Per-group retention for ranked lists
    const rankingStartCounts = this.countActiveByGroupAt(
      enrollmentSnapshots,
      period.start,
    );
    const rankingEndCounts = this.countActiveByGroupAt(
      enrollmentSnapshots,
      period.end,
    );
    const retentionForGroup = (groupId: string) =>
      this.computeRetentionPct(
        rankingStartCounts.get(groupId) ?? 0,
        rankingEndCounts.get(groupId) ?? 0,
      );

    const worstGroups = worstSlice.map((g) => ({
      groupId: g.groupId,
      groupName: nameMap.get(g.groupId) ?? '',
      rate: g.rate,
      retentionPct: retentionForGroup(g.groupId),
    }));
    const bestGroups = bestSlice.map((g) => ({
      groupId: g.groupId,
      groupName: nameMap.get(g.groupId) ?? '',
      rate: g.rate,
      retentionPct: retentionForGroup(g.groupId),
    }));

    const result = {
      overallRate,
      overallRetention,
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

    const cacheKey = `reports:attendance-by-group:v2:${companyId}:${query.branchId || 'all'}:${query.startDate || ''}:${query.endDate || ''}:${query.courseId || 'all'}:${query.teacherId || 'all'}:${sortBy}:${sortOrder}:${page}:${pageSize}`;
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
      },
    });

    if (groups.length === 0) {
      const empty = { groups: [], total: 0, page, pageSize };
      await this.redis.setex(cacheKey, 300, JSON.stringify(empty));
      return empty;
    }

    const groupIds = groups.map((g) => g.id);
    const dateFilter = this.buildDateFilter(query);
    const period = this.resolvePeriod(query);

    const [attendance, lessonCounts, enrollmentSnapshots] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ['groupId', 'status'],
        where: {
          companyId,
          groupId: { in: groupIds },
          ...dateFilter,
        },
        _count: { id: true },
      }),
      this.prisma.attendance.groupBy({
        by: ['groupId', 'date'],
        where: {
          companyId,
          groupId: { in: groupIds },
          ...dateFilter,
        },
      }),
      this.loadEnrollmentsForCounts(companyId, groupIds),
    ]);

    const startCounts = this.countActiveByGroupAt(
      enrollmentSnapshots,
      period.start,
    );
    const endCounts = this.countActiveByGroupAt(
      enrollmentSnapshots,
      period.end,
    );

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
      const startStudentCount = startCounts.get(g.id) ?? 0;
      const endStudentCount = endCounts.get(g.id) ?? 0;
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
        startStudentCount,
        endStudentCount,
        retentionPct: this.computeRetentionPct(
          startStudentCount,
          endStudentCount,
        ),
        lessonCount: lessonsMap.get(g.id) ?? 0,
        attendanceRate,
        present: a?.present ?? 0,
        absent: a?.absent ?? 0,
        late: a?.late ?? 0,
        excused: a?.excused ?? 0,
      };
    });

    const orderMul = sortOrder === 'asc' ? 1 : -1;
    // null retention sinks to bottom regardless of sort order
    const nullRetentionSinkValue = sortOrder === 'asc' ? Infinity : -Infinity;
    enriched.sort((a, b) => {
      if (sortBy === 'studentCount') {
        return (a.endStudentCount - b.endStudentCount) * orderMul;
      }
      if (sortBy === 'lessonCount') {
        return (a.lessonCount - b.lessonCount) * orderMul;
      }
      if (sortBy === 'retention') {
        const av = a.retentionPct ?? nullRetentionSinkValue;
        const bv = b.retentionPct ?? nullRetentionSinkValue;
        return (av - bv) * orderMul;
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
    const cacheKey = `reports:attendance-by-course:v2:${companyId}:${query.branchId || 'all'}:${query.startDate || ''}:${query.endDate || ''}`;
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
      },
    });

    if (groups.length === 0) {
      const empty = { courses: [] };
      await this.redis.setex(cacheKey, 300, JSON.stringify(empty));
      return empty;
    }

    const groupIds = groups.map((g) => g.id);
    const dateFilter = this.buildDateFilter(query);
    const period = this.resolvePeriod(query);

    const [attendance, lessonCounts, enrollmentSnapshots] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ['groupId', 'status'],
        where: {
          companyId,
          groupId: { in: groupIds },
          ...dateFilter,
        },
        _count: { id: true },
      }),
      this.prisma.attendance.groupBy({
        by: ['groupId', 'date'],
        where: {
          companyId,
          groupId: { in: groupIds },
          ...dateFilter,
        },
      }),
      this.loadEnrollmentsForCounts(companyId, groupIds),
    ]);

    const startCounts = this.countActiveByGroupAt(
      enrollmentSnapshots,
      period.start,
    );
    const endCounts = this.countActiveByGroupAt(
      enrollmentSnapshots,
      period.end,
    );

    type CourseAcc = {
      courseId: string;
      courseName: string;
      groupCount: number;
      startStudentCount: number;
      endStudentCount: number;
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
          startStudentCount: 0,
          endStudentCount: 0,
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
      acc.startStudentCount += startCounts.get(g.id) ?? 0;
      acc.endStudentCount += endCounts.get(g.id) ?? 0;
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
        startStudentCount: acc.startStudentCount,
        endStudentCount: acc.endStudentCount,
        retentionPct: this.computeRetentionPct(
          acc.startStudentCount,
          acc.endStudentCount,
        ),
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

  // Period boundary used for retention math. Mirrors ReportsQueryDto's
  // startDate/endDate parsing but returns concrete Date objects with sensible
  // defaults — start = epoch (so all enrollments count as "before start"),
  // end = now.
  private resolvePeriod(query: {
    startDate?: string;
    endDate?: string;
  }): { start: Date; end: Date } {
    const start = query.startDate ? new Date(query.startDate) : new Date(0);
    const end = query.endDate ? new Date(query.endDate) : new Date();
    return { start, end };
  }

  // Loads all non-deleted enrollments for the given groups with the minimal
  // fields needed to compute "active at date X". Used by retention helpers.
  // Multi-tenant safety comes from the caller scoping `groupIds` to the
  // current company (Enrollment has no companyId column — it inherits via Group).
  private async loadEnrollmentsForCounts(
    _companyId: number,
    groupIds: string[],
  ): Promise<
    Array<{
      id: string;
      groupId: string;
      createdAt: Date;
      status: string;
      statusChangedAt: Date | null;
    }>
  > {
    if (groupIds.length === 0) return [];
    return this.prisma.enrollment.findMany({
      where: {
        deletedAt: null,
        groupId: { in: groupIds },
      },
      select: {
        id: true,
        groupId: true,
        createdAt: true,
        status: true,
        statusChangedAt: true,
      },
    });
  }

  // Was this enrollment "in the group" at the given moment?
  // "In the group" means status was ACTIVE or FROZEN at date X.
  // Uses Enrollment.status + statusChangedAt as a single-transition
  // approximation (matches reports-departed-students.service.ts).
  private isEnrollmentActiveAt(
    e: {
      createdAt: Date;
      status: string;
      statusChangedAt: Date | null;
    },
    date: Date,
  ): boolean {
    if (e.createdAt >= date) return false;
    if (e.status === 'ACTIVE' || e.status === 'FROZEN') return true;
    // Status is DROPPED / TRANSFERRED / COMPLETED — count as active only if
    // the transition happened strictly after the boundary.
    return e.statusChangedAt != null && e.statusChangedAt > date;
  }

  // For each group in `enrollments`, returns the count of enrollments that
  // were active (ACTIVE/FROZEN) at the given date.
  private countActiveByGroupAt(
    enrollments: Array<{
      groupId: string;
      createdAt: Date;
      status: string;
      statusChangedAt: Date | null;
    }>,
    date: Date,
  ): Map<string, number> {
    const out = new Map<string, number>();
    for (const e of enrollments) {
      if (!this.isEnrollmentActiveAt(e, date)) continue;
      out.set(e.groupId, (out.get(e.groupId) ?? 0) + 1);
    }
    return out;
  }

  // retention % from start/end counts, rounded to nearest integer.
  // null when start = 0 (group did not exist or had no students at start).
  private computeRetentionPct(
    startCount: number,
    endCount: number,
  ): number | null {
    if (startCount === 0) return null;
    return Math.round((endCount / startCount) * 100);
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
  ): { key: string; sortStart: string; displayLabel: string } {
    if (bucket === 'month') {
      const year = date.getFullYear();
      const month = date.getMonth();
      const label = `${MONTH_LABELS_UZ[month]} ${year}`;
      const sortStart = `${year}-${String(month + 1).padStart(2, '0')}`;
      return { key: label, sortStart, displayLabel: label };
    }
    // week — key/sort use ISO week string (unique across years), but the
    // display label is the human-readable Monday-of-week date, e.g. "5 Apr"
    const isoWeek = this.getISOWeek(date);
    const monday = this.getISOWeekMonday(date);
    const displayLabel = `${monday.getDate()} ${MONTH_LABELS_UZ[monday.getMonth()]}`;
    return { key: isoWeek, sortStart: isoWeek, displayLabel };
  }

  private getISOWeekMonday(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dayOffset = (d.getDay() + 6) % 7; // Mon=0..Sun=6
    d.setDate(d.getDate() - dayOffset);
    return d;
  }

  // Boundaries (start/end Date objects) of the bucket containing `date`.
  // Used by retention math to count active enrollments at the bucket edges.
  private bucketBoundaries(
    date: Date,
    bucket: 'week' | 'month',
  ): { start: Date; end: Date } {
    if (bucket === 'month') {
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      return { start, end };
    }
    // week — ISO week, Monday-start
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dayOffset = (d.getDay() + 6) % 7; // Mon=0..Sun=6
    const start = new Date(d);
    start.setDate(d.getDate() - dayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
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
