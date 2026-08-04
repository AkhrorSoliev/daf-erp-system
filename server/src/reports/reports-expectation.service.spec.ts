import { Test, TestingModule } from '@nestjs/testing';
import { ReportsExpectationService } from './reports-expectation.service';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { RedisService } from '../redis/redis.service';

describe('ReportsExpectationService', () => {
  let service: ReportsExpectationService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      group: { findMany: jest.fn().mockResolvedValue([]) },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsExpectationService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: HolidaysService,
          useValue: {
            buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
          },
        },
        {
          provide: RedisService,
          useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(ReportsExpectationService);
  });

  it('returns zeros for an empty scope without touching the database', async () => {
    const r = await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: [],
    });
    expect(r.expectedValue).toBe(0);
    expect(prisma.group.findMany).not.toHaveBeenCalled();
  });

  it('confines groups to the caller scope', async () => {
    await service.getMonthlyExpectation(1, { month: '2026-08', branchIds: [7] });
    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: { in: [7] } }),
      }),
    );
  });

  it('applies no branch predicate for an unrestricted caller', async () => {
    await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: null,
    });
    const where = prisma.group.findMany.mock.calls[0][0].where;
    expect(where.branchId).toBeUndefined();
  });

  it('queries Attendance.date with unshifted UTC bounds, upper exclusive', async () => {
    prisma.group.findMany.mockResolvedValueOnce([
      {
        id: 'g1',
        exactDays: [],
        startDate: null,
        endDate: null,
        scheduleSnapshots: [],
        course: { price: 1_200_000, lessonPaymentCount: 12 },
        contracts: [],
        enrollments: [],
      },
    ]);

    await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: null,
    });

    const where = prisma.attendance.findMany.mock.calls[0][0].where;
    expect(where.date.gte).toEqual(new Date(Date.UTC(2026, 7, 1)));
    expect(where.date.lt).toEqual(new Date(Date.UTC(2026, 8, 1)));
    expect(where.date.lte).toBeUndefined();
  });

  it('sums held + remaining into expectedValue', async () => {
    prisma.group.findMany.mockResolvedValueOnce([
      {
        id: 'g1',
        exactDays: ['monday'],
        startDate: null,
        endDate: null,
        scheduleSnapshots: [],
        course: { price: 1_200_000, lessonPaymentCount: 12 },
        contracts: [],
        enrollments: [{ studentId: 10001, student: { discountPercent: 0 } }],
      },
    ]);

    const r = await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: null,
    });

    // Avgust 2026 dushanbalari: 3,10,17,24,31 = 5 dars × 1 o'quvchi × 100 000
    expect(r.remainingLessons).toBe(5);
    expect(r.remainingValue).toBe(500_000);
    expect(r.heldValue).toBe(0);
    expect(r.expectedValue).toBe(500_000);
  });

  it('prices covered lessons exactly like getRecognizedRevenue does', async () => {
    // Ikkalasi ham: metadata.perLessonCost, yo'q bo'lsa course.price / lpc
    // CHEGIRMASIZ. Chegirma qo'llansa bu test yiqiladi — u atayin shunday.
    prisma.group.findMany.mockResolvedValueOnce([
      {
        id: 'g1',
        exactDays: [],
        startDate: null,
        endDate: null,
        scheduleSnapshots: [],
        course: { price: 1_200_000, lessonPaymentCount: 12 },
        contracts: [],
        enrollments: [{ studentId: 10001, student: { discountPercent: 40 } }],
      },
    ]);
    prisma.attendance.findMany.mockResolvedValueOnce([
      {
        id: 'a1',
        groupId: 'g1',
        studentId: 10001,
        date: new Date('2026-08-03'),
      },
      {
        id: 'a2',
        groupId: 'g1',
        studentId: 10001,
        date: new Date('2026-08-05'),
      },
    ]);
    prisma.transaction.findMany.mockResolvedValueOnce([
      { attendanceId: 'a1', metadata: { perLessonCost: 60_000 } },
      { attendanceId: 'a2', metadata: null }, // legacy → 1 200 000 / 12
    ]);

    const r = await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: null,
    });

    expect(r.heldValue).toBe(160_000); // 60 000 + 100 000, NOT 60 000 + 60 000
    expect(r.heldLessons).toBe(2);
  });

  it('puts an attendance with no live consumption on the remaining side', async () => {
    prisma.group.findMany.mockResolvedValueOnce([
      {
        id: 'g1',
        exactDays: [],
        startDate: null,
        endDate: null,
        scheduleSnapshots: [],
        course: { price: 1_200_000, lessonPaymentCount: 12 },
        contracts: [],
        enrollments: [{ studentId: 10001, student: { discountPercent: 40 } }],
      },
    ]);
    prisma.attendance.findMany.mockResolvedValueOnce([
      {
        id: 'a1',
        groupId: 'g1',
        studentId: 10001,
        date: new Date('2026-08-03'),
      },
    ]);
    prisma.transaction.findMany.mockResolvedValueOnce([]); // qoplanmagan

    const r = await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: null,
    });

    // Qarzdorning darsi — o'quvchi narxida (40% chegirma), kutilayotgan tarafda.
    expect(r.heldValue).toBe(0);
    expect(r.remainingValue).toBe(60_000);
    expect(r.remainingLessons).toBe(1);
  });

  it('replays the month as of a given day when asOf is passed', async () => {
    prisma.group.findMany.mockResolvedValueOnce([
      {
        id: 'g1',
        exactDays: ['monday'],
        startDate: null,
        endDate: null,
        scheduleSnapshots: [],
        course: { price: 1_200_000, lessonPaymentCount: 12 },
        contracts: [],
        enrollments: [{ studentId: 10001, student: { discountPercent: 0 } }],
      },
    ]);

    await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: null,
      asOf: '2026-08-10',
    });

    const where = prisma.attendance.findMany.mock.calls[0][0].where;
    expect(where.date.lt).toEqual(new Date(Date.UTC(2026, 7, 11)));
  });
});
