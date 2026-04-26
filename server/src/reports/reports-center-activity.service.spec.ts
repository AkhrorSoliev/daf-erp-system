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
    // theoreticalMax = capacity(20) × possibleGroups(floor(84h/10h)=8) = 160
    // extraCapacity = 160 − 10 enrolled = 150
    expect(result.kpis.extraStudentsCapacity).toBe(150);
    expect(result.rooms[0].totals.theoreticalMaxStudents).toBe(160);
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

  it('extraStudentsCapacity uses time-slot formula, not just empty seats', async () => {
    // 14-seat room, 12h/day × 7 = 84h/week working
    // One group: 10 students, 6h/week (3 days × 2h)
    // possibleGroups = floor(84 / 6) = 14
    // theoreticalMax = 14 × 14 = 196
    // extraCapacity = 196 − 10 = 186
    // emptySeats (different metric) = 14 − 10 = 4
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
        '11:00', // 2h × 3 = 6h/week
        500_000,
      ),
    ]);

    const result = await service.getCenterActivity(1, makeQuery());
    expect(result.rooms[0].totals.emptySeats).toBe(4);
    expect(result.rooms[0].totals.theoreticalMaxStudents).toBe(196);
    expect(result.rooms[0].totals.extraStudentsCapacity).toBe(186);
    expect(result.kpis.emptySeats).toBe(4);
    expect(result.kpis.extraStudentsCapacity).toBe(186);
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
    course: { price },
    enrollments: Array.from({ length: enrolledCount }, (_, i) =>
      enrollment(parseInt(`${id.replace(/\D/g, '')}${i.toString().padStart(3, '0')}`)),
    ),
  };
}
