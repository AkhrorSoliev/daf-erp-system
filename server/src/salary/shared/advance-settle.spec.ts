import { settlePendingAdvances } from './advance-settle';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const adv = (id: string, amount: number, date: string, createdAt: string) => ({
  id,
  amount,
  date: day(date),
  createdAt: new Date(createdAt),
});

function makeTx(pending: ReturnType<typeof adv>[]) {
  return {
    expense: {
      findMany: jest.fn().mockResolvedValue(pending),
      updateMany: jest.fn().mockResolvedValue({}),
    },
  } as any;
}
const base = {
  paymentId: 'p1',
  userId: 10500,
  companyId: 1,
  periodEndDateExclusive: day('2026-10-01'),
};

describe('settlePendingAdvances', () => {
  it('settles nothing when there are no pending advances', async () => {
    const tx = makeTx([]);
    expect(
      await settlePendingAdvances(tx, { ...base, available: 1_000_000 }),
    ).toBe(0);
    expect(tx.expense.updateMany).not.toHaveBeenCalled();
  });

  it('settles every advance that fits and returns their total', async () => {
    const tx = makeTx([
      adv('a', 500_000, '2026-09-25', '2026-09-25T12:00:00Z'),
      adv('b', 1_000_000, '2026-09-28', '2026-09-28T12:00:00Z'),
    ]);
    const total = await settlePendingAdvances(tx, {
      ...base,
      available: 1_500_000,
    });
    expect(total).toBe(1_500_000);
    expect(tx.expense.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      data: { settledBySalaryPaymentId: 'p1' },
    });
  });

  it('stops at the first advance that does not fit', async () => {
    const tx = makeTx([
      adv('a', 500_000, '2026-09-25', '2026-09-25T12:00:00Z'),
      adv('b', 1_000_000, '2026-09-28', '2026-09-28T12:00:00Z'),
    ]);
    const total = await settlePendingAdvances(tx, {
      ...base,
      available: 900_000,
    });
    expect(total).toBe(500_000);
    expect(tx.expense.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a'] } },
      data: { settledBySalaryPaymentId: 'p1' },
    });
  });

  it('ignores an advance dated on or after the period end', async () => {
    const tx = makeTx([
      adv('a', 400_000, '2026-10-01', '2026-10-01T01:00:00Z'),
    ]);
    expect(
      await settlePendingAdvances(tx, { ...base, available: 5_000_000 }),
    ).toBe(0);
    expect(tx.expense.updateMany).not.toHaveBeenCalled();
  });

  it('reads only live, unsettled TEACHER_ADVANCE rows of this person and company', async () => {
    const tx = makeTx([]);
    await settlePendingAdvances(tx, { ...base, available: 1 });
    expect(tx.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          category: 'TEACHER_ADVANCE',
          relatedUserId: 10500,
          companyId: 1,
          settledBySalaryPaymentId: null,
          deletedAt: null,
        },
      }),
    );
  });
});
