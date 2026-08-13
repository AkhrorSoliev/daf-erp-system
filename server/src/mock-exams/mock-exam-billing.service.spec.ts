import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MockExamBillingService } from './mock-exam-billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';

describe('MockExamBillingService — branch attribution', () => {
  let service: MockExamBillingService;
  let prisma: any;

  const STUDENT = 10500;
  const COMPANY = 1001;

  beforeEach(async () => {
    prisma = {
      mockExamParticipant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p-1',
            examId: 'e-1',
            feeAmount: 100_000,
            telegramChatId: null,
            publicId: 7,
            exam: { price: 120_000, title: 'A1 Mock' },
          },
        ]),
        update: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: STUDENT, balance: 500_000 }]),
      student: { update: jest.fn() },
      transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      studentBranch: { findFirst: jest.fn().mockResolvedValue({ branchId: 2 }) },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockExamBillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: TransactionsService,
          useValue: { reverseTransaction: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(MockExamBillingService);
  });

  it("charges the mock fee to the student's branch", async () => {
    const result = await service.tryDeductForStudent({
      studentId: STUDENT,
      companyId: COMPANY,
    });

    expect(result.paidCount).toBe(1);
    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'MOCK_EXAM_FEE',
          amount: -100_000,
          branchId: 2,
        }),
      }),
    );
  });

  it('refuses to post a branch-less fee row', async () => {
    prisma.studentBranch.findFirst.mockResolvedValue(null);
    prisma.enrollment.findFirst.mockResolvedValue(null);

    await expect(
      service.tryDeductForStudent({ studentId: STUDENT, companyId: COMPANY }),
    ).rejects.toThrow(/filial aniqlanmadi/);

    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});
