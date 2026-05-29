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
      attendance: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
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

      expect(prisma.attendance.groupBy).toHaveBeenCalledTimes(2);
      for (const call of prisma.attendance.groupBy.mock.calls) {
        const arg = call[0];
        expect(arg.where.date).toBeInstanceOf(Date);
        // Critical: it must NOT be a { gte, lt } range — that was the bug.
        expect(arg.where.date).not.toEqual(
          expect.objectContaining({
            gte: expect.anything(),
            lt: expect.anything(),
          }),
        );
        expect(arg.where.companyId).toBe(1001);
      }
    });

    it('uses a UTC-midnight Date (no -5h Tashkent shift)', async () => {
      await service.buildDailyReport(1001);

      const date: Date = prisma.attendance.groupBy.mock.calls[0][0].where.date;
      expect(date.getUTCHours()).toBe(0);
      expect(date.getUTCMinutes()).toBe(0);
      expect(date.getUTCSeconds()).toBe(0);
      expect(date.getUTCMilliseconds()).toBe(0);
    });
  });

  describe('buildDailyReport — Darslar + Davomat composition', () => {
    it('renders distinct group count for Darslar, status breakdown for Davomat', async () => {
      prisma.attendance.groupBy
        .mockResolvedValueOnce([
          { status: 'PRESENT', _count: 102 },
          { status: 'ABSENT', _count: 118 },
          { status: 'EXCUSED', _count: 1 },
        ])
        .mockResolvedValueOnce(
          Array.from({ length: 18 }, (_, i) => ({ groupId: `g${i}` })),
        );

      const out = await service.buildDailyReport(1001);

      expect(out).toContain('• Darslar: <b>18</b> ta 📚');
      expect(out).toContain(
        '• Davomat: <b>102/221</b> keldi (46%) · <b>118</b> kelmadi · <b>1</b> bekor ✅',
      );
    });

    it('shows 0% Davomat with zero divisor guard when no attendance taken', async () => {
      prisma.attendance.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const out = await service.buildDailyReport(1001);

      expect(out).toContain('• Darslar: <b>0</b> ta 📚');
      expect(out).toContain(
        '• Davomat: <b>0/0</b> keldi (0%) · <b>0</b> kelmadi · <b>0</b> bekor ✅',
      );
    });

    it('counts LATE as attended for the keldi numerator', async () => {
      prisma.attendance.groupBy
        .mockResolvedValueOnce([
          { status: 'PRESENT', _count: 50 },
          { status: 'LATE', _count: 10 },
          { status: 'ABSENT', _count: 40 },
        ])
        .mockResolvedValueOnce([{ groupId: 'a' }, { groupId: 'b' }]);

      const out = await service.buildDailyReport(1001);

      // attended = 60, total marked = 100, pct = 60%.
      expect(out).toContain(
        '• Davomat: <b>60/100</b> keldi (60%) · <b>40</b> kelmadi · <b>0</b> bekor ✅',
      );
    });

    it('shows lessonsToday inside "Faol guruhlar" line', async () => {
      prisma.group.count.mockResolvedValueOnce(38);
      prisma.attendance.groupBy
        .mockResolvedValueOnce([{ status: 'PRESENT', _count: 1 }])
        .mockResolvedValueOnce(
          Array.from({ length: 18 }, (_, i) => ({ groupId: `g${i}` })),
        );

      const out = await service.buildDailyReport(1001);

      expect(out).toContain('• Faol guruhlar: <b>38</b> (bugun dars: <b>18</b>) 👥');
    });
  });

  describe('buildDailyReport — full message shape', () => {
    it('contains all section headers and icons in order', async () => {
      const out = await service.buildDailyReport(1001);

      expect(out).toContain('<b>Bugun:</b>');
      expect(out).toContain('<b>Hozirgi holat:</b>');
      expect(out).toMatch(/🆕[\s\S]*💰[\s\S]*📚[\s\S]*✅/);
      expect(out).toMatch(/👨‍🎓[\s\S]*👥[\s\S]*👨‍🏫[\s\S]*💸[\s\S]*💵/);
    });
  });
});
