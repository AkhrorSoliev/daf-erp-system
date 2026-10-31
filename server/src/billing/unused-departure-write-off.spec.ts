import { writeOffUnusedDepartureLessons } from './unused-departure-write-off';

const enr = {
  id: 'enr-1',
  groupId: 'grp-1',
  statusChangedAt: new Date('2026-10-31T08:58:00.000Z'),
  group: { name: '#054' },
  monthlyCharges: [
    {
      coveredDates: [
        '2026-10-02',
        '2026-10-05',
        '2026-10-07',
        '2026-10-09',
        '2026-10-12',
        '2026-10-14',
        '2026-10-16',
        '2026-10-19',
        '2026-10-21',
        '2026-10-23',
        '2026-10-26',
        '2026-10-28',
        '2026-10-30',
      ],
      frozenOutDates: [],
      perLessonCost: 34_615,
      discountPercent: 0,
    },
  ],
};
// The 7 days with no row (02–14 are "attended").
const UNUSED = [
  '2026-10-16',
  '2026-10-19',
  '2026-10-21',
  '2026-10-23',
  '2026-10-26',
  '2026-10-28',
  '2026-10-30',
];

function makeTx(opts: {
  balance: number;
  chargedAmount?: number;
  frozenOutDates?: string[];
}) {
  const heldDates = [...enr.monthlyCharges[0].coveredDates];
  const charge = {
    id: 'charge-1',
    studentId: 10882,
    branchId: 2,
    coveredDates: enr.monthlyCharges[0].coveredDates,
    frozenOutDates: opts.frozenOutDates ?? [],
    perLessonCost: 34_615,
    discountPercent: 0,
    chargedAmount: opts.chargedAmount ?? 450_000,
    status: 'CHARGED',
  };
  return {
    enrollment: { findMany: jest.fn().mockResolvedValue([enr]) },
    attendance: {
      groupBy: jest.fn().mockResolvedValue(
        heldDates.map((d) => ({
          groupId: 'grp-1',
          date: new Date(`${d}T00:00:00.000Z`),
        })),
      ),
      findMany: jest.fn().mockResolvedValue(
        [
          '2026-10-02',
          '2026-10-05',
          '2026-10-07',
          '2026-10-09',
          '2026-10-12',
          '2026-10-14',
        ].map((d) => ({
          groupId: 'grp-1',
          date: new Date(`${d}T00:00:00.000Z`),
        })),
      ),
    },
    student: {
      findFirst: jest.fn().mockResolvedValue({ balance: opts.balance }),
    },
    enrollmentMonthlyCharge: {
      findUnique: jest.fn().mockResolvedValue(charge),
      update: jest.fn().mockResolvedValue({}),
    },
    entityHistory: { create: jest.fn().mockResolvedValue({}) },
  } as never;
}

const requested = (dates: string[]) =>
  dates.map((date) => ({ enrollmentId: 'enr-1', date }));

describe('writeOffUnusedDepartureLessons', () => {
  it('caps the total at the current debt, still freeing every requested day', async () => {
    const tx = makeTx({ balance: -233_330 });
    const writes = { createAdjustment: jest.fn().mockResolvedValue({}) };
    const result = await writeOffUnusedDepartureLessons(tx, writes as never, {
      studentId: 10882,
      companyId: 1001,
      requested: requested(UNUSED),
      performedById: 90001,
    });
    expect(result).toEqual({ days: 7, amount: 233_330 });
    expect(writes.createAdjustment).toHaveBeenCalledTimes(1);
    expect(writes.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 10882,
        amount: 233_330,
        actor: { kind: 'user', id: 90001 },
        metadata: expect.objectContaining({
          kind: 'unused-departure-release',
          enrollmentId: 'enr-1',
          dates: UNUSED,
        }),
      }),
      tx,
    );
    // All 7 days join frozenOutDates even though the money fell short of the
    // nominal 7 × 34 615 = 242 305.
    expect((tx as any).enrollmentMonthlyCharge.update).toHaveBeenCalledWith({
      where: { id: 'charge-1' },
      data: {
        coveredLessons: 13 - 7,
        chargedAmount: 450_000 - 233_330,
        frozenOutDates: [...UNUSED].sort(),
      },
    });
  });

  it('never exceeds the per-charge chargedAmount even with debt to spare', async () => {
    const tx = makeTx({ balance: -1_000_000, chargedAmount: 100_000 });
    const writes = { createAdjustment: jest.fn().mockResolvedValue({}) };
    const result = await writeOffUnusedDepartureLessons(tx, writes as never, {
      studentId: 10882,
      companyId: 1001,
      requested: requested(UNUSED),
      performedById: 90001,
    });
    expect(result.amount).toBe(100_000);
  });

  it('writes nothing when the student has no debt', async () => {
    const tx = makeTx({ balance: 0 });
    const writes = { createAdjustment: jest.fn() };
    const result = await writeOffUnusedDepartureLessons(tx, writes as never, {
      studentId: 10882,
      companyId: 1001,
      requested: requested(UNUSED),
      performedById: 90001,
    });
    expect(result).toEqual({ days: 0, amount: 0 });
    expect(writes.createAdjustment).not.toHaveBeenCalled();
  });

  it('drops a day the server no longer finds unused (race-safe)', async () => {
    const tx = makeTx({ balance: -100_000 });
    const writes = { createAdjustment: jest.fn().mockResolvedValue({}) };
    const result = await writeOffUnusedDepartureLessons(tx, writes as never, {
      studentId: 10882,
      companyId: 1001,
      // One real unused day plus one the client made up — ignored silently.
      requested: [
        ...requested(['2026-10-16']),
        { enrollmentId: 'enr-1', date: '2026-10-05' },
      ],
      performedById: 90001,
    });
    expect(result.days).toBe(1);
    expect(result.amount).toBe(34_615);
  });

  it('skips a day the charge already froze out', async () => {
    const tx = makeTx({ balance: -233_330, frozenOutDates: ['2026-10-16'] });
    const writes = { createAdjustment: jest.fn().mockResolvedValue({}) };
    const result = await writeOffUnusedDepartureLessons(tx, writes as never, {
      studentId: 10882,
      companyId: 1001,
      requested: requested(['2026-10-16']),
      performedById: 90001,
    });
    expect(result).toEqual({ days: 0, amount: 0 });
  });

  it('returns nothing for an empty request without touching the database', async () => {
    const tx = makeTx({ balance: -233_330 });
    const writes = { createAdjustment: jest.fn() };
    const result = await writeOffUnusedDepartureLessons(tx, writes as never, {
      studentId: 10882,
      companyId: 1001,
      requested: [],
      performedById: 90001,
    });
    expect(result).toEqual({ days: 0, amount: 0 });
    expect((tx as any).enrollment.findMany).not.toHaveBeenCalled();
  });
});
