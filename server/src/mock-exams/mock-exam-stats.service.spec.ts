import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockExamBillingService } from './mock-exam-billing.service';
import { MockExamStatsService } from './mock-exam-stats.service';

describe('MockExamStatsService', () => {
  let service: MockExamStatsService;
  let prisma: any;
  let billing: { paidFromBalanceIds: jest.Mock };

  beforeEach(async () => {
    prisma = {
      mockExam: { findFirst: jest.fn() },
      mockExamParticipant: { findMany: jest.fn().mockResolvedValue([]) },
    };
    billing = { paidFromBalanceIds: jest.fn().mockResolvedValue(new Set()) };
    const module = await Test.createTestingModule({
      providers: [
        MockExamStatsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MockExamBillingService, useValue: billing },
      ],
    }).compile();
    service = module.get(MockExamStatsService);
  });

  const participant = (over: Record<string, unknown>) => ({
    id: 'p',
    registeredVia: 'BOT',
    studentId: null,
    convertedAt: null,
    feeAmount: 55000,
    paid: false,
    paymentMethod: null,
    formData: {},
    level: null,
    examTime: null,
    telegramChatId: null,
    resultSentAt: null,
    resultSendError: null,
    ...over,
  });

  describe('getStats', () => {
    it("looks the exam up inside the caller's company and branches", async () => {
      prisma.mockExam.findFirst.mockResolvedValue(null);

      await expect(service.getStats('e1', 1001, [2])).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.mockExam.findFirst.mock.calls[0][0].where).toEqual({
        id: 'e1',
        deletedAt: null,
        companyId: 1001,
        branchId: { in: [2] },
      });
      expect(prisma.mockExamParticipant.findMany).not.toHaveBeenCalled();
    });

    it('counts live participants and asks about balance only for method-less payments', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        price: 55000,
        offeredLevels: [],
        examTimes: [],
        announcedAt: null,
      });
      prisma.mockExamParticipant.findMany.mockResolvedValue([
        participant({ id: 'p1', paid: true, paymentMethod: 'CASH' }),
        participant({ id: 'p2', paid: true }),
        participant({ id: 'p3' }),
      ]);
      billing.paidFromBalanceIds.mockResolvedValue(new Set(['p2']));

      const stats = await service.getStats('e1', 1001, null);

      expect(
        prisma.mockExamParticipant.findMany.mock.calls[0][0].where,
      ).toEqual({ examId: 'e1', deletedAt: null });
      expect(billing.paidFromBalanceIds).toHaveBeenCalledWith(['p2']);
      expect(stats.methods).toEqual([
        { method: 'CASH', count: 1, sum: 55000 },
        { method: 'BALANCE', count: 1, sum: 55000 },
      ]);
      expect(stats.money.unpaidCount).toBe(1);
    });
  });

  describe('paidTotals', () => {
    it('sums paid registrations per exam with the old-price fallback', async () => {
      prisma.mockExamParticipant.findMany.mockResolvedValue([
        { examId: 'e1', feeAmount: 45000 },
        { examId: 'e1', feeAmount: null },
        { examId: 'e2', feeAmount: 40000 },
      ]);

      const totals = await service.paidTotals([
        { id: 'e1', price: 55000 },
        { id: 'e2', price: 40000 },
        { id: 'e3', price: 40000 },
      ]);

      expect(
        prisma.mockExamParticipant.findMany.mock.calls[0][0].where,
      ).toEqual({
        examId: { in: ['e1', 'e2', 'e3'] },
        deletedAt: null,
        paid: true,
      });
      expect(totals.get('e1')).toEqual({ paidCount: 2, revenue: 100000 });
      expect(totals.get('e2')).toEqual({ paidCount: 1, revenue: 40000 });
      expect(totals.get('e3')).toEqual({ paidCount: 0, revenue: 0 });
    });

    it('does not query for an empty list', async () => {
      const totals = await service.paidTotals([]);

      expect(totals.size).toBe(0);
      expect(prisma.mockExamParticipant.findMany).not.toHaveBeenCalled();
    });
  });
});
