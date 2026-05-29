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
    it('renders distinct group count for Darslar and keldi/kelmadi breakdown', async () => {
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

      expect(out).toContain('• Darslar: <b>18</b> ta');
      // EXCUSED is excluded from both denominator and display.
      // 102 / (102 + 118) = 102/220 = 46%.
      expect(out).toContain(
        '• Keldi: <b>102</b> ta · Kelmadi: <b>118</b> ta (46% qatnashish)',
      );
      expect(out).not.toContain('bekor');
    });

    it('shows 0% with zero divisor guard when no attendance taken', async () => {
      prisma.attendance.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const out = await service.buildDailyReport(1001);

      expect(out).toContain('• Darslar: <b>0</b> ta');
      expect(out).toContain(
        '• Keldi: <b>0</b> ta · Kelmadi: <b>0</b> ta (0% qatnashish)',
      );
    });

    it('counts LATE as keldi', async () => {
      prisma.attendance.groupBy
        .mockResolvedValueOnce([
          { status: 'PRESENT', _count: 50 },
          { status: 'LATE', _count: 10 },
          { status: 'ABSENT', _count: 40 },
        ])
        .mockResolvedValueOnce([{ groupId: 'a' }, { groupId: 'b' }]);

      const out = await service.buildDailyReport(1001);

      // attended = 60, denom = 100, pct = 60%.
      expect(out).toContain(
        '• Keldi: <b>60</b> ta · Kelmadi: <b>40</b> ta (60% qatnashish)',
      );
    });

    it('does NOT count EXCUSED in numerator or denominator', async () => {
      prisma.attendance.groupBy
        .mockResolvedValueOnce([
          { status: 'PRESENT', _count: 10 },
          { status: 'ABSENT', _count: 10 },
          { status: 'EXCUSED', _count: 80 },
        ])
        .mockResolvedValueOnce([{ groupId: 'g1' }]);

      const out = await service.buildDailyReport(1001);

      // If EXCUSED leaked in, pct would be 10/100 = 10%. Real pct = 10/20 = 50%.
      expect(out).toContain(
        '• Keldi: <b>10</b> ta · Kelmadi: <b>10</b> ta (50% qatnashish)',
      );
    });
  });

  describe('buildDailyReport — minimal-icon shape', () => {
    it('keeps only the header chart icon, no per-line icons', async () => {
      const out = await service.buildDailyReport(1001);

      expect(out).toContain('📊');
      // Per-line icons that were removed.
      for (const icon of ['🆕', '💰', '📚', '✅', '👨‍🎓', '👥', '👨‍🏫', '💸', '💵']) {
        expect(out).not.toContain(icon);
      }
    });

    it('keeps both section headers', async () => {
      const out = await service.buildDailyReport(1001);
      expect(out).toContain('<b>Bugun:</b>');
      expect(out).toContain('<b>Hozirgi holat:</b>');
    });
  });
});
