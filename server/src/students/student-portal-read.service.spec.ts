import { StudentPortalReadService } from './student-portal-read.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StudentPortalReadService.getPaymentHistory', () => {
  const ts = (s: string) => new Date(`${s}T10:00:00Z`);

  function build(rows: unknown[]) {
    const prisma = {
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const service = new StudentPortalReadService(
      prisma as unknown as PrismaService,
    );
    return { prisma, service };
  }

  it('lists only rows that move the balance', async () => {
    const { prisma, service } = build([]);
    await service.getPaymentHistory(10042);

    const arg = prisma.transaction.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ studentId: 10042, amount: { not: 0 } });
    expect(arg.take).toBe(20);
  });

  it('tells the student which rows a cancellation undid', async () => {
    const { service } = build([
      {
        id: 'charge',
        type: 'LESSON_DEDUCTION',
        amount: -37500,
        description: 'Dars uchun yechildi',
        createdAt: ts('2026-09-18'),
        reversedAt: ts('2026-09-25'),
        reversedTransaction: null,
        reversalEntries: [
          { createdAt: ts('2026-09-25'), description: 'Bekor qilindi: X' },
        ],
      },
    ]);

    const { transactions } = await service.getPaymentHistory(10042);

    expect(transactions[0]).toEqual({
      id: 'charge',
      type: 'LESSON_DEDUCTION',
      amount: -37500,
      description: 'Dars uchun yechildi',
      createdAt: ts('2026-09-18'),
      reversal: { kind: 'reversed', at: ts('2026-09-25'), reason: 'X' },
    });
  });
});
