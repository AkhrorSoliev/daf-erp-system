import { Test, TestingModule } from '@nestjs/testing';
import { ReportsCenterActivityService } from './reports-center-activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('ReportsCenterActivityService', () => {
  let service: ReportsCenterActivityService;
  let prisma: any;
  let redis: any;

  const branch = {
    name: 'Markaziy',
    startOfWorkingDay: '09:00',
    endOfWorkingDay: '21:00', // 12h/day
  };

  beforeEach(async () => {
    prisma = {
      room: { findMany: jest.fn() },
      group: { findMany: jest.fn() },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      roomCapacitySnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      groupScheduleSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      coursePriceSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      enrollmentStateLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsCenterActivityService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(ReportsCenterActivityService);
  });

  function makeQuery(overrides: Record<string, any> = {}) {
    return {
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      bucket: 'daily' as const,
      ...overrides,
    };
  }

  it('returns cached payload when present', async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify({ cached: true }));
    const result = await service.getCenterActivity(1, makeQuery());
    expect(result).toEqual({ cached: true });
    expect(prisma.room.findMany).not.toHaveBeenCalled();
  });

  it('computes core metrics for a single room with one group', async () => {
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'Xona 1', capacity: 20, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      {
        id: 'g1',
        name: 'A2',
        roomId: 'r1',
        branchId: 1,
        exactDays: ['monday', 'wednesday', 'friday', 'saturday', 'sunday'],
        lessonStartTime: '09:00',
        lessonEndTime: '11:00', // 2h × 5 days = 10h/week
        startDate: new Date('2025-01-01'),
        endDate: new Date('2027-01-01'),
        createdAt: new Date('2025-01-01'),
        course: { price: 1_000_000 },
        enrollments: Array.from({ length: 10 }, (_, i) => ({
          id: `e${i}`,
          studentId: 1000 + i,
          createdAt: new Date('2026-01-01'),
          statusChangedAt: null,
          status: 'ACTIVE',
        })),
      },
    ]);

    const result = await service.getCenterActivity(1, makeQuery());

    expect(result.rooms).toHaveLength(1);
    const room = result.rooms[0];
    expect(room.totals.enrolled).toBe(10);
    expect(room.totals.emptySeats).toBe(10);
    expect(room.totals.lessonHoursPerWeek).toBe(10);
    expect(room.workingHoursPerWeek).toBe(84); // 12 × 7
    expect(room.totals.idleHoursPerWeek).toBe(74);
    // FIK = (10 students × 10h) / (20 cap × 84h) × 100 = 100/1680 = 5.95...
    expect(room.totals.fikPct).toBeCloseTo(6, 0);
    // Potential extra revenue = (20 - 10) × 1,000,000 = 10,000,000
    expect(room.totals.potentialExtraRevenue).toBe(10_000_000);
    expect(result.kpis.activeStudents).toBe(10);
    expect(result.kpis.emptySeats).toBe(10);
    // extraStudentsCapacity = sum of (capacity - enrolled) per group
    // = (20 - 10) = 10 for the single group
    expect(result.kpis.extraStudentsCapacity).toBe(10);
    expect(result.kpis.potentialExtraRevenue).toBe(10_000_000);
  });

  it('uses max() not sum() for emptySeats across multiple groups in one room', async () => {
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'Xona 1', capacity: 20, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      makeGroup('g1', 'r1', 15, ['monday'], '09:00', '11:00', 1_000_000),
      makeGroup('g2', 'r1', 12, ['tuesday'], '09:00', '11:00', 1_000_000),
    ]);

    const result = await service.getCenterActivity(1, makeQuery());
    // max enrolled = 15 → empty = 20 - 15 = 5
    expect(result.rooms[0].totals.emptySeats).toBe(5);
    expect(result.kpis.emptySeats).toBe(5);
  });

  it('emptySeats is peak-based, extraStudentsCapacity sums slots across groups', async () => {
    // 14-seat room with 2 groups
    //   Group A: 10 enrolled (Mon mornings) → 4 empty in this group
    //   Group B: 12 enrolled (Tue evenings)  → 2 empty in this group
    // emptySeats (peak)        = 14 − max(10, 12) = 2
    // extraStudentsCapacity    = 4 + 2 = 6
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'X', capacity: 14, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      makeGroup('a', 'r1', 10, ['monday'], '09:00', '11:00', 500_000),
      makeGroup('b', 'r1', 12, ['tuesday'], '18:00', '20:00', 500_000),
    ]);

    const result = await service.getCenterActivity(1, makeQuery());
    expect(result.rooms[0].totals.emptySeats).toBe(2);
    expect(result.rooms[0].totals.extraStudentsCapacity).toBe(6);
    expect(result.kpis.emptySeats).toBe(2);
    expect(result.kpis.extraStudentsCapacity).toBe(6);
  });

  it('utilizationPct uses room-hour basis, not seat-hour', async () => {
    // 1 room, 12h/day × 7 = 84h/week working
    // 1 group: 6h/week scheduled (3 days × 2h)
    // utilization = 6 / 84 ≈ 7.1%
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'X', capacity: 14, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      makeGroup(
        'g1',
        'r1',
        10,
        ['monday', 'wednesday', 'friday'],
        '09:00',
        '11:00',
        500_000,
      ),
    ]);

    const result = await service.getCenterActivity(1, makeQuery());
    expect(result.kpis.utilizationPct).toBeCloseTo(7.1, 1);
  });

  it('returns null FIK when capacity is missing', async () => {
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'Xona 1', capacity: null, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      makeGroup('g1', 'r1', 10, ['monday'], '09:00', '11:00', 500_000),
    ]);

    const result = await service.getCenterActivity(1, makeQuery());
    expect(result.rooms[0].totals.fikPct).toBeNull();
    expect(result.rooms[0].totals.seatHoursPlanned).toBeNull();
    expect(result.rooms[0].totals.potentialExtraRevenue).toBe(0);
  });

  it('counts distinct active students across multiple groups', async () => {
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'Xona 1', capacity: 30, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      {
        id: 'g1',
        name: 'A',
        roomId: 'r1',
        branchId: 1,
        exactDays: ['monday'],
        lessonStartTime: '09:00',
        lessonEndTime: '10:00',
        startDate: null,
        endDate: null,
        createdAt: new Date('2025-01-01'),
        course: { price: 0 },
        enrollments: [
          enrollment(100),
          enrollment(101),
          enrollment(102),
        ],
      },
      {
        id: 'g2',
        name: 'B',
        roomId: 'r1',
        branchId: 1,
        exactDays: ['tuesday'],
        lessonStartTime: '09:00',
        lessonEndTime: '10:00',
        startDate: null,
        endDate: null,
        createdAt: new Date('2025-01-01'),
        course: { price: 0 },
        // student 101 is in both groups → distinct count = 4
        enrollments: [
          enrollment(101),
          enrollment(103),
        ],
      },
    ]);

    const result = await service.getCenterActivity(1, makeQuery());
    expect(result.kpis.activeStudents).toBe(4);
  });

  it('builds potentialBreakdown sorted by gap descending', async () => {
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'Kichik', capacity: 10, branchId: 1, branch },
      { id: 'r2', name: 'Katta', capacity: 30, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      makeGroup('g1', 'r1', 8, ['monday'], '09:00', '10:00', 500_000),
      makeGroup('g2', 'r2', 5, ['monday'], '09:00', '10:00', 500_000),
    ]);

    const result = await service.getCenterActivity(1, makeQuery());
    const { potentialBreakdown } = result;

    // Big room has more gap → comes first
    expect(potentialBreakdown.rooms[0].roomId).toBe('r2');
    expect(potentialBreakdown.rooms[0].gap).toBe(12_500_000); // (30-5) × 500K
    expect(potentialBreakdown.rooms[1].gap).toBe(1_000_000); // (10-8) × 500K
    expect(potentialBreakdown.gap).toBe(13_500_000);
    expect(potentialBreakdown.currentIncome).toBe(6_500_000);
    expect(potentialBreakdown.maxIncome).toBe(20_000_000);
  });

  it('KPI cards show zero for periods before any group existed', async () => {
    // Group + enrollment created on 2026-04-01.
    // Selected period: Feb 2 - Feb 20, 2026 (entirely before launch).
    // All KPIs should be 0; rooms list should be empty (no operational data).
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'X', capacity: 14, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      {
        id: 'g1',
        name: 'A',
        roomId: 'r1',
        branchId: 1,
        exactDays: ['monday'],
        lessonStartTime: '09:00',
        lessonEndTime: '11:00',
        startDate: null,
        endDate: null,
        createdAt: new Date('2026-04-01'),
        course: { price: 500_000 },
        enrollments: [
          {
            id: 'e1',
            studentId: 100,
            createdAt: new Date('2026-04-01'),
            statusChangedAt: null,
            status: 'ACTIVE',
          },
        ],
      },
    ]);

    const result = await service.getCenterActivity(
      1,
      makeQuery({
        startDate: '2026-02-02',
        endDate: '2026-02-20',
        bucket: 'daily',
      }),
    );

    expect(result.kpis.utilizationPct).toBe(0);
    expect(result.kpis.emptyHours).toBe(0);
    expect(result.kpis.activeStudents).toBe(0);
    expect(result.kpis.potentialExtraRevenue).toBe(0);
    expect(result.kpis.emptySeats).toBe(0);
    expect(result.kpis.extraStudentsCapacity).toBe(0);
    expect(result.rooms).toHaveLength(0);
    expect(result.potentialBreakdown.currentIncome).toBe(0);
    expect(result.potentialBreakdown.maxIncome).toBe(0);
  });

  it('returns zero metrics in trend buckets before any group existed', async () => {
    // Group created on 2026-04-01. Range is 2026-01-01 to 2026-04-30 monthly.
    // Yan/Fev/Mart should be 0 across all metrics; Apr should have data.
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'X', capacity: 10, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      {
        id: 'g1',
        name: 'A',
        roomId: 'r1',
        branchId: 1,
        exactDays: ['monday', 'wednesday', 'friday'],
        lessonStartTime: '09:00',
        lessonEndTime: '11:00',
        startDate: null,
        endDate: null,
        createdAt: new Date('2026-04-01'),
        course: { price: 500_000 },
        enrollments: [
          {
            id: 'e1',
            studentId: 100,
            createdAt: new Date('2026-04-01'),
            statusChangedAt: null,
            status: 'ACTIVE',
          },
        ],
      },
    ]);

    const result = await service.getCenterActivity(
      1,
      makeQuery({
        startDate: '2026-01-01',
        endDate: '2026-04-30',
        bucket: 'monthly',
      }),
    );

    // 4 monthly buckets: Yan, Fev, Mart, Apr
    expect(result.trend).toHaveLength(4);
    // First three months are zero
    for (let i = 0; i < 3; i++) {
      expect(result.trend[i].utilizationPct).toBe(0);
      expect(result.trend[i].emptyHours).toBe(0);
      expect(result.trend[i].activeStudents).toBe(0);
      expect(result.trend[i].emptySeats).toBe(0);
      expect(result.trend[i].extraStudentsCapacity).toBe(0);
    }
    // April has data
    expect(result.trend[3].activeStudents).toBeGreaterThan(0);
    expect(result.trend[3].extraStudentsCapacity).toBeGreaterThan(0);
  });

  it('aggregates trend data into weekly buckets when requested', async () => {
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'X', capacity: 10, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      makeGroup(
        'g1',
        'r1',
        5,
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        '09:00',
        '10:00',
        100_000,
      ),
    ]);

    const result = await service.getCenterActivity(
      1,
      makeQuery({ bucket: 'weekly' }),
    );
    expect(result.range.bucketUsed).toBe('weekly');
    expect(result.trend.length).toBeGreaterThan(0);
    expect(result.trend.length).toBeLessThan(10); // April has ~5 weeks
    expect(result.trend[0].label).toContain('haftasi');
  });

  it('auto-promotes daily to weekly when range exceeds 90 days', async () => {
    prisma.room.findMany.mockResolvedValue([]);
    prisma.group.findMany.mockResolvedValue([]);

    const result = await service.getCenterActivity(
      1,
      makeQuery({
        startDate: '2026-01-01',
        endDate: '2026-06-30', // 181 days
        bucket: 'daily',
      }),
    );
    expect(result.range.bucketUsed).toBe('weekly');
  });

  it('caches the result with 5-minute TTL', async () => {
    prisma.room.findMany.mockResolvedValue([]);
    prisma.group.findMany.mockResolvedValue([]);

    await service.getCenterActivity(1, makeQuery());
    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringContaining('reports:center-activity:1:'),
      300,
      expect.any(String),
    );
  });

  // ----- Snapshot-based historical accuracy tests --------------------------

  it('uses historical capacity snapshot, not current room.capacity', async () => {
    // Room currently has capacity 30, but historically had 14 in April 2026.
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'X', capacity: 30, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      makeGroup(
        'g1',
        'r1',
        10,
        ['monday', 'wednesday', 'friday'],
        '09:00',
        '11:00',
        500_000,
      ),
    ]);
    prisma.roomCapacitySnapshot.findMany.mockResolvedValue([
      {
        roomId: 'r1',
        capacity: 14,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-05-01'),
      },
      {
        roomId: 'r1',
        capacity: 30,
        validFrom: new Date('2026-05-01'),
        validTo: null,
      },
    ]);

    const result = await service.getCenterActivity(1, makeQuery());
    // April period uses historical capacity 14, not current 30
    expect(result.rooms[0].capacity).toBe(14);
    expect(result.rooms[0].totals.emptySeats).toBe(4); // 14 − 10
    expect(result.rooms[0].totals.extraStudentsCapacity).toBe(4);
  });

  it('uses historical course price for revenue calculations', async () => {
    // Course currently 1M, but in April it was 600K.
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'X', capacity: 20, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      makeGroup('g1', 'r1', 10, ['monday'], '09:00', '11:00', 1_000_000),
    ]);
    // Course price snapshot: 600K in April, 1M in May
    prisma.coursePriceSnapshot.findMany.mockResolvedValue([
      {
        courseId: 'g1course',
        price: 600_000,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-05-01'),
      },
      {
        courseId: 'g1course',
        price: 1_000_000,
        validFrom: new Date('2026-05-01'),
        validTo: null,
      },
    ]);

    // Override courseId on the mock group so it matches our snapshot
    const groups = await prisma.group.findMany();
    groups[0].courseId = 'g1course';
    prisma.group.findMany.mockResolvedValue(groups);

    const result = await service.getCenterActivity(1, makeQuery());
    expect(result.rooms[0].groups[0].coursePrice).toBe(600_000);
    expect(result.rooms[0].totals.revenueSum).toBe(6_000_000); // 10 × 600K
  });

  it('replays multiple status transitions via EnrollmentStateLog', async () => {
    // Enrollment timeline:
    //   2026-01-01: ACTIVE (initial)
    //   2026-02-01: FROZEN
    //   2026-04-15: ACTIVE (resumed)
    // For April period query (Apr 1-30) we expect this enrollment to be:
    //   - INACTIVE on Apr 14 (still frozen)
    //   - ACTIVE on Apr 30 (resumed)
    // KPI snapshot at Apr 30 → 1 active student.
    prisma.room.findMany.mockResolvedValue([
      { id: 'r1', name: 'X', capacity: 20, branchId: 1, branch },
    ]);
    prisma.group.findMany.mockResolvedValue([
      {
        id: 'g1',
        name: 'A',
        roomId: 'r1',
        branchId: 1,
        courseId: 'c1',
        exactDays: ['monday'],
        lessonStartTime: '09:00',
        lessonEndTime: '10:00',
        startDate: null,
        endDate: null,
        createdAt: new Date('2026-01-01'),
        course: { price: 0 },
        enrollments: [
          {
            id: 'e1',
            studentId: 100,
            createdAt: new Date('2026-01-01'),
            statusChangedAt: new Date('2026-04-15'),
            // current status (would be misleading without state log)
            status: 'ACTIVE',
          },
        ],
      },
    ]);
    prisma.enrollmentStateLog.findMany.mockResolvedValue([
      { enrollmentId: 'e1', status: 'ACTIVE', transitionAt: new Date('2026-01-01') },
      { enrollmentId: 'e1', status: 'FROZEN', transitionAt: new Date('2026-02-01') },
      { enrollmentId: 'e1', status: 'ACTIVE', transitionAt: new Date('2026-04-15') },
    ]);

    const result = await service.getCenterActivity(1, makeQuery());
    // Apr 30 snapshot — student is ACTIVE again
    expect(result.kpis.activeStudents).toBe(1);
    expect(result.rooms[0].totals.enrolled).toBe(1);
  });
});

function enrollment(studentId: number) {
  return {
    id: `e${studentId}`,
    studentId,
    createdAt: new Date('2026-01-01'),
    statusChangedAt: null,
    status: 'ACTIVE',
  };
}

function makeGroup(
  id: string,
  roomId: string,
  enrolledCount: number,
  exactDays: string[],
  start: string,
  end: string,
  price: number,
) {
  return {
    id,
    name: id.toUpperCase(),
    roomId,
    branchId: 1,
    exactDays,
    lessonStartTime: start,
    lessonEndTime: end,
    startDate: null,
    endDate: null,
    createdAt: new Date('2025-01-01'),
    course: { price },
    enrollments: Array.from({ length: enrolledCount }, (_, i) =>
      enrollment(parseInt(`${id.replace(/\D/g, '')}${i.toString().padStart(3, '0')}`)),
    ),
  };
}
