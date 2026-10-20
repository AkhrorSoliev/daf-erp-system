import { kunlikKalit, recordAttempt } from './attempt-writer';

function fakePrisma() {
  return {
    dafAttempt: { create: jest.fn(async (args: unknown) => args) },
    $executeRaw: jest.fn(async () => 1),
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const DATA = {
  studentId: 10001,
  companyId: 1,
  branchId: 3,
  groupId: 'g-1',
  isCorrect: true,
  given: 'das Haus',
  points: 10,
};

describe('kunlikKalit', () => {
  it('a Tashkent evening after 19:00 UTC is already the next day', () => {
    expect(kunlikKalit(new Date('2026-10-18T19:30:00Z'), 'g-1')).toEqual({
      day: '2026-10-19',
      groupKey: 'g-1',
    });
  });

  it('no group is the empty string, never null', () => {
    expect(kunlikKalit(new Date('2026-10-18T10:00:00Z'), null).groupKey).toBe(
      '',
    );
    expect(
      kunlikKalit(new Date('2026-10-18T10:00:00Z'), undefined).groupKey,
    ).toBe('');
  });
});

describe('recordAttempt', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-18T19:30:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('writes the attempt and the day row in one transaction', async () => {
    const prisma = fakePrisma();
    await recordAttempt(prisma as any, DATA);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
    const created = prisma.dafAttempt.create.mock.calls[0][0] as {
      data: { createdAt: Date; points: number };
    };
    expect(created.data.createdAt).toEqual(new Date('2026-10-18T19:30:00Z'));
    expect(created.data.points).toBe(10);

    // Tagged template: [strings, ...values].
    const values = prisma.$executeRaw.mock.calls[0].slice(1);
    expect(values).toEqual([10001, 1, '2026-10-19', 'g-1', 10]);
  });

  it('an attempt without points adds 0 points and still counts', async () => {
    const prisma = fakePrisma();
    const { points: _p, ...rest } = DATA;
    await recordAttempt(prisma as any, { ...rest, groupId: null });
    const values = prisma.$executeRaw.mock.calls[0].slice(1);
    expect(values).toEqual([10001, 1, '2026-10-19', '', 0]);
  });

  it('a failed day row fails the whole write', async () => {
    const prisma = fakePrisma();
    prisma.$executeRaw.mockRejectedValueOnce(new Error('db down'));
    await expect(recordAttempt(prisma as any, DATA)).rejects.toThrow('db down');
  });
});
