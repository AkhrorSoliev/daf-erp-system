import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  CenterActivityBucket,
  CenterActivityQueryDto,
} from './dto/center-activity-query.dto';

const DEFAULT_WORK_START = '09:00';
const DEFAULT_WORK_END = '21:00';

const MAX_DAILY_DAYS = 90;
const MAX_WEEKLY_WEEKS = 52;
const MAX_MONTHLY_MONTHS = 24;

const UZ_MONTHS = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

interface ResolvedRange {
  startDate: string;
  endDate: string;
  start: Date;
  end: Date;
  days: number;
  weeks: number;
}

interface RoomRecord {
  id: string;
  name: string;
  capacity: number | null;
  branchId: number;
  branch: {
    name: string;
    startOfWorkingDay: string | null;
    endOfWorkingDay: string | null;
  };
}

interface GroupRecord {
  id: string;
  name: string;
  roomId: string | null;
  branchId: number;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  startDate: Date | null;
  endDate: Date | null;
  course: { price: number } | null;
  enrollments: Array<{
    id: string;
    studentId: number;
    createdAt: Date;
    statusChangedAt: Date | null;
    status: string;
  }>;
}

@Injectable()
export class ReportsCenterActivityService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getCenterActivity(companyId: number, query: CenterActivityQueryDto) {
    const range = this.resolveRange(query);
    const requestedBucket: CenterActivityBucket = query.bucket ?? 'daily';
    const bucketUsed = this.resolveBucket(requestedBucket, range.days);

    const cacheKey = this.buildCacheKey(companyId, query, range, bucketUsed);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const branchFilter = query.branchId ? { branchId: query.branchId } : {};

    const [rooms, groups, holidays] = await Promise.all([
      this.prisma.room.findMany({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          ...branchFilter,
        },
        select: {
          id: true,
          name: true,
          capacity: true,
          branchId: true,
          branch: {
            select: {
              name: true,
              startOfWorkingDay: true,
              endOfWorkingDay: true,
            },
          },
        },
        orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
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
          roomId: true,
          branchId: true,
          exactDays: true,
          lessonStartTime: true,
          lessonEndTime: true,
          startDate: true,
          endDate: true,
          course: { select: { price: true } },
          enrollments: {
            where: { deletedAt: null },
            select: {
              id: true,
              studentId: true,
              createdAt: true,
              statusChangedAt: true,
              status: true,
            },
          },
        },
      }),

      this.prisma.holiday.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          date: { gte: range.start, lte: range.end },
        },
        select: { date: true },
      }),
    ]);

    const holidayDates = new Set(
      holidays.map((h) => this.toIsoDate(h.date)),
    );

    const workingDaysInPeriod = this.countWorkingDays(range, holidayDates);
    const periodScale = workingDaysInPeriod / 7;

    const groupsByRoom = new Map<string, GroupRecord[]>();
    for (const g of groups) {
      if (!g.roomId) continue;
      const list = groupsByRoom.get(g.roomId) ?? [];
      list.push(g);
      groupsByRoom.set(g.roomId, list);
    }

    const roomsResponse = rooms.map((room) =>
      this.buildRoomEntry(room, groupsByRoom.get(room.id) ?? [], periodScale),
    );

    const activeStudents = this.countDistinctActiveStudents(groups, range);
    const kpis = this.aggregateKpis(roomsResponse, activeStudents);
    const potentialBreakdown = this.buildPotentialBreakdown(roomsResponse);
    const trend = this.buildTrend(
      rooms,
      groups,
      range,
      holidayDates,
      bucketUsed,
    );

    const result = {
      range: {
        startDate: range.startDate,
        endDate: range.endDate,
        days: range.days,
        weeks: Math.round(range.weeks * 10) / 10,
        bucketUsed,
      },
      kpis,
      potentialBreakdown,
      rooms: roomsResponse,
      trend,
    };

    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

  private buildRoomEntry(
    room: RoomRecord,
    roomGroups: GroupRecord[],
    periodScale: number,
  ) {
    const workingHoursPerDay = this.computeWorkingHoursPerDay(room.branch);
    const workingHoursPerWeek = workingHoursPerDay * 7;

    const groupEntries = roomGroups.map((g) => {
      const enrolled = g.enrollments.filter(
        (e) => e.status === 'ACTIVE',
      ).length;
      const lessonHoursPerLesson = this.computeLessonHours(
        g.lessonStartTime,
        g.lessonEndTime,
      );
      const lessonHoursPerWeek = lessonHoursPerLesson * g.exactDays.length;
      const coursePrice = g.course?.price ?? 0;
      return {
        id: g.id,
        name: g.name,
        enrolled,
        lessonHoursPerWeek: Math.round(lessonHoursPerWeek * 100) / 100,
        coursePrice,
        groupTotalRevenue: enrolled * coursePrice,
      };
    });

    const lessonHoursPerWeek = this.sumDistinctScheduleHours(roomGroups);
    const enrolledTotal = groupEntries.reduce((sum, g) => sum + g.enrolled, 0);
    const maxEnrolledByGroup = groupEntries.reduce(
      (max, g) => Math.max(max, g.enrolled),
      0,
    );
    const coursePriceSum = groupEntries.reduce(
      (sum, g) => sum + g.coursePrice,
      0,
    );
    const revenueSum = groupEntries.reduce(
      (sum, g) => sum + g.groupTotalRevenue,
      0,
    );

    const capacity = room.capacity;
    const emptySeats =
      capacity != null ? Math.max(0, capacity - maxEnrolledByGroup) : 0;
    const idleHoursPerWeek = Math.max(
      0,
      workingHoursPerWeek - lessonHoursPerWeek,
    );

    const seatHoursActualWeekly = groupEntries.reduce(
      (sum, g) => sum + g.enrolled * g.lessonHoursPerWeek,
      0,
    );
    const seatHoursPlannedWeekly =
      capacity != null ? capacity * workingHoursPerWeek : null;
    const seatHoursCapacityScheduledWeekly =
      capacity != null ? capacity * lessonHoursPerWeek : null;

    const seatHoursActualPeriod = seatHoursActualWeekly * periodScale;
    const seatHoursPlannedPeriod =
      seatHoursPlannedWeekly !== null
        ? seatHoursPlannedWeekly * periodScale
        : null;
    const idleHoursPeriod = idleHoursPerWeek * periodScale;

    const fikPct =
      seatHoursPlannedWeekly && seatHoursPlannedWeekly > 0
        ? Math.round((seatHoursActualWeekly / seatHoursPlannedWeekly) * 1000) /
          10
        : null;

    const potentialExtraRevenue = groupEntries.reduce((sum, g) => {
      if (capacity == null) return sum;
      const empty = Math.max(0, capacity - g.enrolled);
      return sum + empty * g.coursePrice;
    }, 0);

    return {
      id: room.id,
      name: room.name,
      branchId: room.branchId,
      branchName: room.branch.name,
      capacity,
      workingHoursPerWeek: Math.round(workingHoursPerWeek * 10) / 10,
      groups: groupEntries,
      totals: {
        groupCount: groupEntries.length,
        enrolled: enrolledTotal,
        emptySeats,
        lessonHoursPerWeek: Math.round(lessonHoursPerWeek * 10) / 10,
        idleHoursPerWeek: Math.round(idleHoursPerWeek * 10) / 10,
        idleHoursPeriod: Math.round(idleHoursPeriod * 10) / 10,
        coursePriceSum,
        revenueSum,
        potentialExtraRevenue,
        seatHoursCapacityScheduled:
          seatHoursCapacityScheduledWeekly !== null
            ? Math.round(seatHoursCapacityScheduledWeekly * 10) / 10
            : null,
        seatHoursActual: Math.round(seatHoursActualWeekly * 10) / 10,
        seatHoursPlanned:
          seatHoursPlannedWeekly !== null
            ? Math.round(seatHoursPlannedWeekly * 10) / 10
            : null,
        seatHoursActualPeriod: Math.round(seatHoursActualPeriod * 10) / 10,
        seatHoursPlannedPeriod:
          seatHoursPlannedPeriod !== null
            ? Math.round(seatHoursPlannedPeriod * 10) / 10
            : null,
        fikPct,
      },
    };
  }

  private aggregateKpis(
    rooms: ReturnType<ReportsCenterActivityService['buildRoomEntry']>[],
    activeStudents: number,
  ) {
    let totalSeatHoursActual = 0;
    let totalSeatHoursPlanned = 0;
    let emptyHours = 0;
    let emptySeats = 0;
    let potentialExtraRevenue = 0;

    for (const r of rooms) {
      totalSeatHoursActual += r.totals.seatHoursActualPeriod;
      if (r.totals.seatHoursPlannedPeriod !== null) {
        totalSeatHoursPlanned += r.totals.seatHoursPlannedPeriod;
      }
      emptyHours += r.totals.idleHoursPeriod;
      emptySeats += r.totals.emptySeats;
      potentialExtraRevenue += r.totals.potentialExtraRevenue;
    }

    const utilizationPct =
      totalSeatHoursPlanned > 0
        ? Math.round((totalSeatHoursActual / totalSeatHoursPlanned) * 1000) / 10
        : 0;

    return {
      utilizationPct,
      emptyHours: Math.round(emptyHours * 10) / 10,
      activeStudents,
      potentialExtraRevenue,
      emptySeats,
      extraStudentsCapacity: emptySeats,
    };
  }

  private countDistinctActiveStudents(
    groups: GroupRecord[],
    range: ResolvedRange,
  ): number {
    const studentIds = new Set<number>();
    for (const g of groups) {
      for (const e of g.enrollments) {
        if (e.status !== 'ACTIVE') continue;
        if (e.createdAt > range.end) continue;
        studentIds.add(e.studentId);
      }
    }
    return studentIds.size;
  }

  private buildPotentialBreakdown(
    rooms: ReturnType<typeof this.buildRoomEntry>[],
  ) {
    let currentIncome = 0;
    let maxIncome = 0;
    const roomDetails = rooms
      .map((r) => {
        const cap = r.capacity ?? 0;
        const roomMax = r.groups.reduce(
          (sum, g) => sum + (cap > 0 ? cap * g.coursePrice : 0),
          0,
        );
        const roomCurrent = r.totals.revenueSum;
        currentIncome += roomCurrent;
        maxIncome += roomMax;
        return {
          roomId: r.id,
          roomName: r.name,
          branchName: r.branchName,
          capacity: r.capacity,
          enrolled: r.totals.enrolled,
          currentIncome: roomCurrent,
          maxIncome: roomMax,
          gap: Math.max(0, roomMax - roomCurrent),
          fillPct:
            roomMax > 0
              ? Math.round((roomCurrent / roomMax) * 1000) / 10
              : null,
        };
      })
      .sort((a, b) => b.gap - a.gap);

    const gap = Math.max(0, maxIncome - currentIncome);
    const utilizationPct =
      maxIncome > 0 ? Math.round((currentIncome / maxIncome) * 1000) / 10 : 0;
    const growthPct =
      currentIncome > 0 ? Math.round((gap / currentIncome) * 1000) / 10 : 0;

    return {
      currentIncome,
      maxIncome,
      gap,
      utilizationPct,
      growthPct,
      rooms: roomDetails,
    };
  }

  private buildTrend(
    rooms: RoomRecord[],
    groups: GroupRecord[],
    range: ResolvedRange,
    holidayDates: Set<string>,
    bucket: CenterActivityBucket,
  ) {
    type DayPoint = {
      date: Date;
      iso: string;
      utilizationPct: number;
      emptyHours: number;
      activeStudents: number;
      emptySeats: number;
      extraStudentsCapacity: number;
    };

    const groupsByRoom = new Map<string, GroupRecord[]>();
    for (const g of groups) {
      if (!g.roomId) continue;
      const list = groupsByRoom.get(g.roomId) ?? [];
      list.push(g);
      groupsByRoom.set(g.roomId, list);
    }

    const daily: DayPoint[] = [];
    const cursor = new Date(range.start);
    while (cursor <= range.end) {
      const iso = this.toIsoDate(cursor);
      const isHoliday = holidayDates.has(iso);

      let totalSeatHoursActual = 0;
      let totalSeatHoursPlanned = 0;
      let totalIdle = 0;
      let totalEmptySeats = 0;
      const studentIds = new Set<number>();

      if (!isHoliday) {
        const dow = cursor.getDay();
        const dayCode = this.dayCodeFromDow(dow);

        for (const room of rooms) {
          const roomGroups = groupsByRoom.get(room.id) ?? [];
          const workingHours = this.computeWorkingHoursPerDay(room.branch);

          const groupsToday = roomGroups.filter(
            (g) =>
              g.exactDays.includes(dayCode) &&
              this.groupActiveOn(g, cursor),
          );

          let scheduledHours = 0;
          let seatHoursActual = 0;
          let maxEnrolled = 0;
          for (const g of groupsToday) {
            const lessonHours = this.computeLessonHours(
              g.lessonStartTime,
              g.lessonEndTime,
            );
            scheduledHours += lessonHours;
            const enrolled = g.enrollments.filter((e) =>
              this.enrollmentActiveOn(e, cursor),
            ).length;
            seatHoursActual += enrolled * lessonHours;
            maxEnrolled = Math.max(maxEnrolled, enrolled);
            for (const e of g.enrollments) {
              if (this.enrollmentActiveOn(e, cursor)) {
                studentIds.add(e.studentId);
              }
            }
          }

          totalIdle += Math.max(0, workingHours - scheduledHours);
          totalSeatHoursActual += seatHoursActual;
          if (room.capacity != null) {
            totalSeatHoursPlanned += room.capacity * workingHours;
            totalEmptySeats += Math.max(0, room.capacity - maxEnrolled);
          }
        }
      }

      const utilizationPct =
        totalSeatHoursPlanned > 0
          ? Math.round(
              (totalSeatHoursActual / totalSeatHoursPlanned) * 1000,
            ) / 10
          : 0;

      daily.push({
        date: new Date(cursor),
        iso,
        utilizationPct,
        emptyHours: Math.round(totalIdle * 10) / 10,
        activeStudents: studentIds.size,
        emptySeats: totalEmptySeats,
        extraStudentsCapacity: totalEmptySeats,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    return this.bucketize(daily, bucket);
  }

  private bucketize(
    daily: Array<{
      date: Date;
      iso: string;
      utilizationPct: number;
      emptyHours: number;
      activeStudents: number;
      emptySeats: number;
      extraStudentsCapacity: number;
    }>,
    bucket: CenterActivityBucket,
  ) {
    if (bucket === 'daily') {
      return daily.map((d) => ({
        bucketStart: d.iso,
        label: this.formatDayLabel(d.date),
        utilizationPct: d.utilizationPct,
        emptyHours: d.emptyHours,
        activeStudents: d.activeStudents,
        emptySeats: d.emptySeats,
        extraStudentsCapacity: d.extraStudentsCapacity,
      }));
    }

    type BucketAgg = {
      bucketStart: string;
      label: string;
      sumUtil: number;
      sumEmpty: number;
      sumStudents: number;
      sumSeats: number;
      count: number;
    };

    const map = new Map<string, BucketAgg>();
    for (const d of daily) {
      const key =
        bucket === 'weekly' ? this.weekKey(d.date) : this.monthKey(d.date);
      const existing = map.get(key);
      if (existing) {
        existing.sumUtil += d.utilizationPct;
        existing.sumEmpty += d.emptyHours;
        existing.sumStudents += d.activeStudents;
        existing.sumSeats += d.emptySeats;
        existing.count += 1;
      } else {
        const start =
          bucket === 'weekly'
            ? this.weekStart(d.date)
            : new Date(d.date.getFullYear(), d.date.getMonth(), 1);
        map.set(key, {
          bucketStart: this.toIsoDate(start),
          label:
            bucket === 'weekly'
              ? `${this.formatDayLabel(start)} haftasi`
              : UZ_MONTHS[start.getMonth()],
          sumUtil: d.utilizationPct,
          sumEmpty: d.emptyHours,
          sumStudents: d.activeStudents,
          sumSeats: d.emptySeats,
          count: 1,
        });
      }
    }

    return Array.from(map.values())
      .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart))
      .map((b) => ({
        bucketStart: b.bucketStart,
        label: b.label,
        utilizationPct: Math.round((b.sumUtil / b.count) * 10) / 10,
        emptyHours: Math.round(b.sumEmpty * 10) / 10,
        activeStudents: Math.round(b.sumStudents / b.count),
        emptySeats: Math.round(b.sumSeats / b.count),
        extraStudentsCapacity: Math.round(b.sumSeats / b.count),
      }));
  }

  // --- helpers --------------------------------------------------------------

  private resolveRange(query: CenterActivityQueryDto): ResolvedRange {
    let start: Date;
    let end: Date;
    if (query.startDate && query.endDate) {
      start = this.parseIso(query.startDate);
      end = this.parseIso(query.endDate);
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    end.setHours(23, 59, 59, 999);
    const days =
      Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return {
      startDate: this.toIsoDate(start),
      endDate: this.toIsoDate(end),
      start,
      end,
      days,
      weeks: days / 7,
    };
  }

  private resolveBucket(
    requested: CenterActivityBucket,
    days: number,
  ): CenterActivityBucket {
    if (requested === 'daily' && days > MAX_DAILY_DAYS) {
      const weeks = Math.ceil(days / 7);
      if (weeks > MAX_WEEKLY_WEEKS) return 'monthly';
      return 'weekly';
    }
    if (requested === 'weekly') {
      const weeks = Math.ceil(days / 7);
      if (weeks > MAX_WEEKLY_WEEKS) return 'monthly';
    }
    if (requested === 'monthly') {
      const months = Math.ceil(days / 30);
      if (months > MAX_MONTHLY_MONTHS) return 'monthly';
    }
    return requested;
  }

  private buildCacheKey(
    companyId: number,
    query: CenterActivityQueryDto,
    range: ResolvedRange,
    bucket: CenterActivityBucket,
  ): string {
    return `reports:center-activity:${companyId}:${query.branchId ?? 'all'}:${range.startDate}:${range.endDate}:${bucket}`;
  }

  private computeWorkingHoursPerDay(branch: {
    startOfWorkingDay: string | null;
    endOfWorkingDay: string | null;
  }): number {
    const start = branch.startOfWorkingDay ?? DEFAULT_WORK_START;
    const end = branch.endOfWorkingDay ?? DEFAULT_WORK_END;
    return this.computeLessonHours(start, end);
  }

  private computeLessonHours(
    startTime: string | null,
    endTime: string | null,
  ): number {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const minutes = eh * 60 + em - (sh * 60 + sm);
    return Math.max(0, minutes / 60);
  }

  /**
   * Sums lesson hours per week with overlap deduplication: if two groups
   * share a 30-min slot on the same day, count it once.
   */
  private sumDistinctScheduleHours(roomGroups: GroupRecord[]): number {
    const slotsByDay = new Map<string, Set<number>>();
    for (const g of roomGroups) {
      if (!g.lessonStartTime || !g.lessonEndTime) continue;
      const startMin = this.timeToMinutes(g.lessonStartTime);
      const endMin = this.timeToMinutes(g.lessonEndTime);
      for (const day of g.exactDays) {
        if (!slotsByDay.has(day)) slotsByDay.set(day, new Set());
        const set = slotsByDay.get(day)!;
        for (let m = startMin; m < endMin; m += 30) set.add(m);
      }
    }
    let totalSlots = 0;
    for (const slots of slotsByDay.values()) totalSlots += slots.size;
    return (totalSlots * 30) / 60;
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private countWorkingDays(
    range: ResolvedRange,
    holidayDates: Set<string>,
  ): number {
    let count = 0;
    const cursor = new Date(range.start);
    while (cursor <= range.end) {
      if (!holidayDates.has(this.toIsoDate(cursor))) count++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  private dayCodeFromDow(dow: number): string {
    return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][dow];
  }

  private groupActiveOn(g: GroupRecord, date: Date): boolean {
    if (g.startDate && date < g.startDate) return false;
    if (g.endDate && date > g.endDate) return false;
    return true;
  }

  private enrollmentActiveOn(
    e: { createdAt: Date; statusChangedAt: Date | null; status: string },
    date: Date,
  ): boolean {
    if (e.createdAt > date) return false;
    if (
      e.status !== 'ACTIVE' &&
      e.statusChangedAt !== null &&
      e.statusChangedAt <= date
    ) {
      return false;
    }
    return true;
  }

  private toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private parseIso(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private formatDayLabel(d: Date): string {
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private weekKey(d: Date): string {
    const monday = this.weekStart(d);
    return this.toIsoDate(monday);
  }

  private weekStart(d: Date): Date {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday-start
    const monday = new Date(d);
    monday.setDate(monday.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  private monthKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
}
