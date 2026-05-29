import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramGroupStatsService } from './telegram-group-stats.service';

describe('TelegramGroupStatsService', () => {
  let service: TelegramGroupStatsService;
  let prisma: {
    student: { count: jest.Mock; aggregate: jest.Mock };
    group: { count: jest.Mock };
    user: { count: jest.Mock };
    payment: { aggregate: jest.Mock };
    attendance: { count: jest.Mock };
    company: { findUnique: jest.Mock };
    role: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      student: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { balance: 0 }, _count: 0 }),
      },
      group: { count: jest.fn().mockResolvedValue(0) },
      user: { count: jest.fn().mockResolvedValue(0) },
      payment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }),
      },
      attendance: { count: jest.fn().mockResolvedValue(0) },
      company: { findUnique: jest.fn().mockResolvedValue({ name: 'Test' }) },
      role: { findFirst: jest.fn().mockResolvedValue({ id: 4 }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupStatsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TelegramGroupStatsService);
  });

  describe('buildDailyReport — attendance.date query (regression)', () => {
    it("filters Attendance.date with a single Date, not a tashkentDayRange window", async () => {
      // The bug being guarded against: Attendance.date is a PostgreSQL DATE
      // column. Filtering it with `{ gte: today.start, lt: today.end }` where
      // today.start/end come from tashkentDayRange() makes Prisma coerce the
      // timestamps to UTC calendar dates, silently shifting the window one
      // day back in Tashkent terms. The fix uses tashkentTodayDate() instead.

      await service.buildDailyReport(1001);

      expect(prisma.attendance.count).toHaveBeenCalledTimes(1);
      const arg = prisma.attendance.count.mock.calls[0][0];
      expect(arg.where.date).toBeInstanceOf(Date);
      // Critical: it must NOT be a { gte, lt } range — that was the bug.
      expect(arg.where.date).not.toEqual(
        expect.objectContaining({ gte: expect.anything(), lt: expect.anything() }),
      );
      expect(arg.where.status).toEqual({ in: ['PRESENT', 'LATE'] });
      expect(arg.where.companyId).toBe(1001);
    });

    it('uses a UTC-midnight Date (no -5h Tashkent shift)', async () => {
      await service.buildDailyReport(1001);

      const date: Date = prisma.attendance.count.mock.calls[0][0].where.date;
      // UTC midnight = hours/minutes/seconds/ms all 0 in UTC.
      expect(date.getUTCHours()).toBe(0);
      expect(date.getUTCMinutes()).toBe(0);
      expect(date.getUTCSeconds()).toBe(0);
      expect(date.getUTCMilliseconds()).toBe(0);
    });
  });

  describe('buildDailyReport — output composition', () => {
    it("renders the Darslar line with the attendance count", async () => {
      prisma.attendance.count.mockResolvedValue(102);
      prisma.student.count.mockResolvedValue(0);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: 0 });

      const out = await service.buildDailyReport(1001);

      expect(out).toContain('• Darslar: <b>102</b>');
    });
  });
});
