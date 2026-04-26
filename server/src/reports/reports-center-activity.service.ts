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
  courseId: string;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  course: { price: number } | null;
  enrollments: Array<{
    id: string;
    studentId: number;
    createdAt: Date;
    statusChangedAt: Date | null;
    status: string;
  }>;
}

// ---------------------------------------------------------------------------
// Snapshot lookup data structures (point-in-time history for activity report)
// ---------------------------------------------------------------------------

interface CapacityPoint {
  capacity: number;
  validFrom: Date;
  validTo: Date | null;
}

interface SchedulePoint {
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  courseId: string | null;
  validFrom: Date;
  validTo: Date | null;
}

interface PricePoint {
  price: number;
  validFrom: Date;
  validTo: Date | null;
}

interface StateEvent {
  status: string;
  transitionAt: Date;
}

interface SnapshotMaps {
  roomCapacity: Map<string, CapacityPoint[]>;
  groupSchedule: Map<string, SchedulePoint[]>;
  coursePrice: Map<string, PricePoint[]>;
  enrollmentEvents: Map<string, StateEvent[]>;
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
          courseId: true,
          exactDays: true,
          lessonStartTime: true,
          lessonEndTime: true,
          startDate: true,
          endDate: true,
          createdAt: true,
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

    // Load point-in-time snapshots for accurate historical reports.
    const snaps = await this.loadSnapshots(rooms, groups, range);

    // Snapshot at the END of the selected period: only count groups that
    // existed by then, and only enrollments that were active by then.
    // For periods entirely before any group existed, all metrics are 0.
    const allRoomEntries = rooms.map((room) => {
      const filteredGroups = (groupsByRoom.get(room.id) ?? []).filter(
        (g) => g.createdAt <= range.end,
      );
      return this.buildRoomEntry(
        room,
        filteredGroups,
        periodScale,
        range.end,
        snaps,
      );
    });

    // KPI aggregate considers all rooms (empty rooms count as wasted
    // capacity in operational periods).
    const activeStudents = this.countDistinctActiveStudents(
      groups,
      range,
      snaps,
    );
    const kpis = this.aggregateKpis(allRoomEntries, activeStudents);

    // Table & breakdown only show rooms that had groups in this period.
    const roomsResponse = allRoomEntries.filter(
      (r) => r.totals.groupCount > 0,
    );
    const potentialBreakdown = this.buildPotentialBreakdown(roomsResponse);
    const trend = this.buildTrend(
      rooms,
      groups,
      range,
      holidayDates,
      bucketUsed,
      snaps,
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
    asOfDate: Date,
    snaps: SnapshotMaps,
  ) {
    const workingHoursPerDay = this.computeWorkingHoursPerDay(room.branch);
    const workingHoursPerWeek = workingHoursPerDay * 7;

    const groupEntries = roomGroups.map((g) => {
      const enrolled = g.enrollments.filter((e) =>
        this.isEnrollmentActiveOn(e, asOfDate, snaps),
      ).length;
      // Use historical schedule and price if available
      const sched = this.scheduleOn(g.id, asOfDate, snaps, {
        exactDays: g.exactDays,
        lessonStartTime: g.lessonStartTime,
        lessonEndTime: g.lessonEndTime,
        courseId: g.courseId,
        validFrom: g.createdAt,
        validTo: null,
      });
      const lessonHoursPerLesson = this.computeLessonHours(
        sched.lessonStartTime,
        sched.lessonEndTime,
      );
      const lessonHoursPerWeek = lessonHoursPerLesson * sched.exactDays.length;
      const coursePrice = this.priceOn(
        sched.courseId,
        asOfDate,
        snaps,
        g.course?.price ?? 0,
      );
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

    // Capacity from snapshot at asOfDate (falls back to current room.capacity)
    const capacity = this.capacityOn(room.id, asOfDate, snaps, room.capacity);
    // If no groups exist as of this date, the room is "not in operation"
    // for this period — emit zeros across the board so pre-launch periods
    // don't inflate emptyHours / emptySeats.
    const noGroups = roomGroups.length === 0;
    const emptySeats =
      noGroups || capacity == null
        ? 0
        : Math.max(0, capacity - maxEnrolledByGroup);
    const idleHoursPerWeek = noGroups
      ? 0
      : Math.max(0, workingHoursPerWeek - lessonHoursPerWeek);

    // Yana o'qishi mumkin bo'lgan o'quvchilar = jami bo'sh enrollment slotlari
    // (har guruh uchun: capacity - enrolled, jami yig'indisi)
    const extraStudentsCapacity =
      capacity != null
        ? groupEntries.reduce(
            (sum, g) => sum + Math.max(0, capacity - g.enrolled),
            0,
          )
        : 0;

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
        extraStudentsCapacity,
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
    let totalScheduledHoursPerWeek = 0;
    let totalWorkingHoursPerWeek = 0;
    let emptyHours = 0;
    let emptySeats = 0;
    let extraStudentsCapacity = 0;
    let potentialExtraRevenue = 0;

    for (const r of rooms) {
      totalScheduledHoursPerWeek += r.totals.lessonHoursPerWeek;
      totalWorkingHoursPerWeek += r.workingHoursPerWeek;
      emptyHours += r.totals.idleHoursPeriod;
      emptySeats += r.totals.emptySeats;
      extraStudentsCapacity += r.totals.extraStudentsCapacity;
      potentialExtraRevenue += r.totals.potentialExtraRevenue;
    }

    // Markaz foydaliligi % = jami band soatlar / jami ish soatlari × 100
    // (xona-vaqti asosi — soat-asoslangan utilization)
    const utilizationPct =
      totalWorkingHoursPerWeek > 0
        ? Math.round(
            (totalScheduledHoursPerWeek / totalWorkingHoursPerWeek) * 1000,
          ) / 10
        : 0;

    return {
      utilizationPct,
      emptyHours: Math.round(emptyHours * 10) / 10,
      activeStudents,
      potentialExtraRevenue,
      emptySeats,
      extraStudentsCapacity,
    };
  }

  private countDistinctActiveStudents(
    groups: GroupRecord[],
    range: ResolvedRange,
    snaps: SnapshotMaps,
  ): number {
    const studentIds = new Set<number>();
    for (const g of groups) {
      if (g.createdAt > range.end) continue;
      for (const e of g.enrollments) {
        if (!this.isEnrollmentActiveOn(e, range.end, snaps)) continue;
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
    snaps: SnapshotMaps,
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

      // If no group existed in the system by this date, the system had no
      // operational data — emit zeros across all metrics rather than treating
      // empty rooms as "all idle hours wasted".
      const anyGroupExistedByDate = groups.some((g) => g.createdAt <= cursor);
      if (!anyGroupExistedByDate) {
        daily.push({
          date: new Date(cursor),
          iso,
          utilizationPct: 0,
          emptyHours: 0,
          activeStudents: 0,
          emptySeats: 0,
          extraStudentsCapacity: 0,
        });
        cursor.setDate(cursor.getDate() + 1);
        continue;
      }

      let totalScheduledHoursToday = 0;
      let totalWorkingHoursToday = 0;
      let totalIdle = 0;
      let totalEmptySeats = 0;
      let totalExtraStudents = 0;
      const studentIds = new Set<number>();

      const dow = cursor.getDay();
      const dayCode = this.dayCodeFromDow(dow);

      for (const room of rooms) {
        const roomGroups = groupsByRoom.get(room.id) ?? [];
        const workingHours = this.computeWorkingHoursPerDay(room.branch);
        totalWorkingHoursToday += workingHours;
        // Capacity from snapshot at this date (falls back to current value)
        const capacityOnDate = this.capacityOn(
          room.id,
          cursor,
          snaps,
          room.capacity,
        );

        // Day-dependent: only groups that meet today (using snapshot schedule)
        const groupsTodayWithSchedule = !isHoliday
          ? roomGroups
              .filter((g) => this.groupActiveOn(g, cursor))
              .map((g) => ({
                group: g,
                schedule: this.scheduleOn(g.id, cursor, snaps, {
                  exactDays: g.exactDays,
                  lessonStartTime: g.lessonStartTime,
                  lessonEndTime: g.lessonEndTime,
                  courseId: g.courseId,
                  validFrom: g.createdAt,
                  validTo: null,
                }),
              }))
              .filter(({ schedule }) => schedule.exactDays.includes(dayCode))
          : [];

        let scheduledHoursToday = 0;
        for (const { schedule } of groupsTodayWithSchedule) {
          scheduledHoursToday += this.computeLessonHours(
            schedule.lessonStartTime,
            schedule.lessonEndTime,
          );
        }

        totalScheduledHoursToday += scheduledHoursToday;
        totalIdle += Math.max(0, workingHours - scheduledHoursToday);

        // Snapshot metrics: based on enrollment state on this date,
        // across ALL room groups (not just today's). Day-of-week independent.
        let maxEnrolledInRoom = 0;
        for (const g of roomGroups) {
          if (!this.groupActiveOn(g, cursor)) continue;
          const enrolledOnDate = g.enrollments.filter((e) =>
            this.isEnrollmentActiveOn(e, cursor, snaps),
          ).length;
          maxEnrolledInRoom = Math.max(maxEnrolledInRoom, enrolledOnDate);
          for (const e of g.enrollments) {
            if (this.isEnrollmentActiveOn(e, cursor, snaps)) {
              studentIds.add(e.studentId);
            }
          }
          // Yana o'qishi mumkin = Σ (capacity - enrolled) per group
          if (capacityOnDate != null) {
            totalExtraStudents += Math.max(
              0,
              capacityOnDate - enrolledOnDate,
            );
          }
        }

        // Bo'sh o'rinlar = capacity - max(enrolled per group), per room
        if (capacityOnDate != null) {
          totalEmptySeats += Math.max(0, capacityOnDate - maxEnrolledInRoom);
        }
      }

      // Markaz foydaliligi % = scheduled / working × 100 (room-hour basis)
      const utilizationPct =
        totalWorkingHoursToday > 0
          ? Math.round(
              (totalScheduledHoursToday / totalWorkingHoursToday) * 1000,
            ) / 10
          : 0;

      daily.push({
        date: new Date(cursor),
        iso,
        utilizationPct,
        emptyHours: Math.round(totalIdle * 10) / 10,
        activeStudents: studentIds.size,
        emptySeats: totalEmptySeats,
        extraStudentsCapacity: totalExtraStudents,
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

  // --- snapshot loading + per-date lookups ---------------------------------

  private async loadSnapshots(
    rooms: RoomRecord[],
    groups: GroupRecord[],
    range: ResolvedRange,
  ): Promise<SnapshotMaps> {
    const roomIds = rooms.map((r) => r.id);
    const groupIds = groups.map((g) => g.id);
    const courseIds = Array.from(
      new Set(groups.map((g) => g.courseId).filter(Boolean)),
    );
    const enrollmentIds = groups.flatMap((g) =>
      g.enrollments.map((e) => e.id),
    );

    // Fetch any snapshot whose validity window overlaps the period:
    // (validFrom <= range.end) AND (validTo IS NULL OR validTo > range.start)
    const overlap = (validToField: string) => ({
      validFrom: { lte: range.end },
      OR: [{ [validToField]: null }, { [validToField]: { gt: range.start } }],
    });

    const [capacities, schedules, prices, events] = await Promise.all([
      roomIds.length === 0
        ? Promise.resolve([])
        : this.prisma.roomCapacitySnapshot.findMany({
            where: {
              roomId: { in: roomIds },
              ...overlap('validTo'),
            },
            select: {
              roomId: true,
              capacity: true,
              validFrom: true,
              validTo: true,
            },
          }),
      groupIds.length === 0
        ? Promise.resolve([])
        : this.prisma.groupScheduleSnapshot.findMany({
            where: {
              groupId: { in: groupIds },
              ...overlap('validTo'),
            },
            select: {
              groupId: true,
              exactDays: true,
              lessonStartTime: true,
              lessonEndTime: true,
              courseId: true,
              validFrom: true,
              validTo: true,
            },
          }),
      courseIds.length === 0
        ? Promise.resolve([])
        : this.prisma.coursePriceSnapshot.findMany({
            where: {
              courseId: { in: courseIds },
              ...overlap('validTo'),
            },
            select: {
              courseId: true,
              price: true,
              validFrom: true,
              validTo: true,
            },
          }),
      enrollmentIds.length === 0
        ? Promise.resolve([])
        : this.prisma.enrollmentStateLog.findMany({
            where: {
              enrollmentId: { in: enrollmentIds },
              transitionAt: { lte: range.end },
            },
            select: {
              enrollmentId: true,
              status: true,
              transitionAt: true,
            },
            orderBy: { transitionAt: 'asc' },
          }),
    ]);

    const roomCapacity = new Map<string, CapacityPoint[]>();
    for (const s of capacities) {
      const arr = roomCapacity.get(s.roomId) ?? [];
      arr.push({
        capacity: s.capacity,
        validFrom: s.validFrom,
        validTo: s.validTo,
      });
      roomCapacity.set(s.roomId, arr);
    }

    const groupSchedule = new Map<string, SchedulePoint[]>();
    for (const s of schedules) {
      const arr = groupSchedule.get(s.groupId) ?? [];
      arr.push({
        exactDays: s.exactDays,
        lessonStartTime: s.lessonStartTime,
        lessonEndTime: s.lessonEndTime,
        courseId: s.courseId,
        validFrom: s.validFrom,
        validTo: s.validTo,
      });
      groupSchedule.set(s.groupId, arr);
    }

    const coursePrice = new Map<string, PricePoint[]>();
    for (const s of prices) {
      const arr = coursePrice.get(s.courseId) ?? [];
      arr.push({
        price: s.price,
        validFrom: s.validFrom,
        validTo: s.validTo,
      });
      coursePrice.set(s.courseId, arr);
    }

    const enrollmentEvents = new Map<string, StateEvent[]>();
    for (const e of events) {
      const arr = enrollmentEvents.get(e.enrollmentId) ?? [];
      arr.push({ status: e.status, transitionAt: e.transitionAt });
      enrollmentEvents.set(e.enrollmentId, arr);
    }

    return { roomCapacity, groupSchedule, coursePrice, enrollmentEvents };
  }

  /**
   * Capacity active on `date`. Falls back to the room's current capacity
   * if no snapshot covers this date (degraded mode for un-backfilled data).
   */
  private capacityOn(
    roomId: string,
    date: Date,
    snaps: SnapshotMaps,
    fallback: number | null,
  ): number | null {
    const arr = snaps.roomCapacity.get(roomId);
    if (!arr) return fallback;
    for (const s of arr) {
      if (s.validFrom <= date && (s.validTo === null || s.validTo > date)) {
        return s.capacity;
      }
    }
    return fallback;
  }

  private scheduleOn(
    groupId: string,
    date: Date,
    snaps: SnapshotMaps,
    fallback: SchedulePoint,
  ): SchedulePoint {
    const arr = snaps.groupSchedule.get(groupId);
    if (!arr) return fallback;
    for (const s of arr) {
      if (s.validFrom <= date && (s.validTo === null || s.validTo > date)) {
        return s;
      }
    }
    return fallback;
  }

  private priceOn(
    courseId: string | null,
    date: Date,
    snaps: SnapshotMaps,
    fallback: number,
  ): number {
    if (!courseId) return fallback;
    const arr = snaps.coursePrice.get(courseId);
    if (!arr) return fallback;
    for (const s of arr) {
      if (s.validFrom <= date && (s.validTo === null || s.validTo > date)) {
        return s.price;
      }
    }
    return fallback;
  }

  /**
   * Status active on `date` from event log. If no events recorded, falls back
   * to deriving from `e.statusChangedAt` and current status.
   */
  private statusOn(
    enrollmentId: string,
    date: Date,
    snaps: SnapshotMaps,
    fallback: {
      createdAt: Date;
      statusChangedAt: Date | null;
      status: string;
    },
  ): string | null {
    const events = snaps.enrollmentEvents.get(enrollmentId);
    if (events && events.length > 0) {
      // Events sorted ascending by transitionAt; find latest <= date
      let last: string | null = null;
      for (const e of events) {
        if (e.transitionAt <= date) last = e.status;
        else break;
      }
      return last;
    }
    // Fallback: legacy enrollment without state log entries
    if (fallback.createdAt > date) return null;
    if (
      fallback.status !== 'ACTIVE' &&
      fallback.statusChangedAt &&
      fallback.statusChangedAt <= date
    ) {
      return fallback.status;
    }
    return 'ACTIVE';
  }

  private isEnrollmentActiveOn(
    e: GroupRecord['enrollments'][number],
    date: Date,
    snaps: SnapshotMaps,
  ): boolean {
    return this.statusOn(e.id, date, snaps, e) === 'ACTIVE';
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
    return [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ][dow];
  }

  private groupActiveOn(g: GroupRecord, date: Date): boolean {
    // Group can't exist in the system before it was created
    if (g.createdAt > date) return false;
    if (g.startDate && date < g.startDate) return false;
    if (g.endDate && date > g.endDate) return false;
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
