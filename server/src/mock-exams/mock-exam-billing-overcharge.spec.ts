import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MockExamBillingService } from './mock-exam-billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';

/**
 * Regressions for the August 2026 mock-exam overcharge, where 690 000 so'm was
 * taken out of students' LESSON balances for an exam the desk had already
 * collected cash for, and another 810 000 sat armed for the next payment each
 * of those students made.
 */
describe('MockExamBillingService — overcharge guards', () => {
  let service: MockExamBillingService;
  let prisma: any;
  let transactions: { reverseTransaction: jest.Mock };

  const STUDENT = 10500;
  const COMPANY = 1001;

  beforeEach(async () => {
    prisma = {
      mockExamParticipant: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ id: STUDENT, balance: 500_000 }]),
      student: { update: jest.fn() },
      transaction: {
        create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      studentBranch: { findFirst: jest.fn().mockResolvedValue({ branchId: 2 }) },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    transactions = { reverseTransaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockExamBillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: TransactionsService, useValue: transactions },
      ],
    }).compile();

    service = module.get(MockExamBillingService);
  });

  describe('a finished exam can no longer reach a balance', () => {
    it('excludes GRADING / ANNOUNCED / ARCHIVED exams from the unpaid sweep', async () => {
      await service.tryDeductForStudent({ studentId: STUDENT, companyId: COMPANY });

      expect(prisma.mockExamParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId: STUDENT,
            paid: false,
            deletedAt: null,
            exam: {
              deletedAt: null,
              status: { notIn: ['GRADING', 'ANNOUNCED', 'ARCHIVED'] },
            },
          }),
        }),
      );
    });

    it('deducts nothing when every unpaid row belongs to a finished exam', async () => {
      // The scoped query returns nothing — that IS the guard doing its job.
      prisma.mockExamParticipant.findMany.mockResolvedValue([]);

      const result = await service.tryDeductForStudent({
        studentId: STUDENT,
        companyId: COMPANY,
      });

      expect(result).toEqual({ paidCount: 0, deductedAmount: 0 });
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it('still bills an exam whose registration is open', async () => {
      prisma.mockExamParticipant.findMany.mockResolvedValue([
        {
          id: 'p-open',
          examId: 'e-open',
          feeAmount: 30_000,
          telegramChatId: null,
          publicId: 10500,
          exam: { price: 40_000, title: 'A1 Mock' },
        },
      ]);

      const result = await service.tryDeductForStudent({
        studentId: STUDENT,
        companyId: COMPANY,
      });

      expect(result).toEqual({ paidCount: 1, deductedAmount: 30_000 });
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'MOCK_EXAM_FEE', amount: -30_000 }),
        }),
      );
    });
  });

  describe('refundParticipantFee', () => {
    it('reverses the fee a removed participant paid from balance', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        { id: 'tx-fee', amount: -30_000, studentId: STUDENT },
      ]);

      const returned = await service.refundParticipantFee('p-1', 10000);

      expect(returned).toBe(30_000);
      expect(transactions.reverseTransaction).toHaveBeenCalledWith(
        'tx-fee',
        expect.objectContaining({ performedById: 10000 }),
        undefined,
      );
    });

    it('looks only at live fee rows for that participant', async () => {
      await service.refundParticipantFee('p-1');

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'MOCK_EXAM_FEE',
            reversedAt: null,
            amount: { lt: 0 },
            metadata: { path: ['mockParticipantId'], equals: 'p-1' },
          }),
        }),
      );
    });

    it('is a no-op for a cash / gateway payer who never touched their balance', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      const returned = await service.refundParticipantFee('p-cash');

      expect(returned).toBe(0);
      expect(transactions.reverseTransaction).not.toHaveBeenCalled();
    });

    it('returns every fee when a participant was somehow billed twice', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        { id: 'tx-a', amount: -30_000, studentId: STUDENT },
        { id: 'tx-b', amount: -30_000, studentId: STUDENT },
      ]);

      const returned = await service.refundParticipantFee('p-dup');

      expect(returned).toBe(60_000);
      expect(transactions.reverseTransaction).toHaveBeenCalledTimes(2);
    });
  });
});
