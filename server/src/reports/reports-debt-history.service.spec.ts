import { Test, TestingModule } from '@nestjs/testing';
import { ReportsDebtHistoryService } from './reports-debt-history.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The invariant every one of these cases is really testing:
 *
 *   openingDebt + debtAdded − debtPaid − debtForgiven − debtOther === closingDebt
 *
 * If a future change makes the replay classify a movement into the wrong
 * bucket, that identity is the thing that breaks — which is why `expectFoots`
 * runs on every result rather than only in the dedicated case.
 */
describe('ReportsDebtHistoryService', () => {
  let service: ReportsDebtHistoryService;
  let prisma: any;

  // A Tashkent-midday instant inside the given month/day.
  const at = (monthKey: string, day: number, hour = 12) =>
    new Date(`${monthKey}-${String(day).padStart(2, '0')}T${hour}:00:00+05:00`);

  const student = (id: number, balance: number, over: any = {}) => ({
    id,
    balance,
    status: 'ACTIVE',
    deletedAt: null,
    ...over,
  });

  const tx = (
    studentId: number,
    type: string,
    amount: number,
    createdAt: Date,
  ) => ({ studentId, type, amount, createdAt });

  /** Every row's roll-forward must close. */
  const expectFoots = (months: any[]) => {
    for (const m of months) {
      expect(
        m.openingDebt +
          m.debtAdded -
          m.debtPaid -
          m.debtForgiven -
          m.debtOther,
      ).toBe(m.closingDebt);
    }
    // Consecutive months must chain: this month opens where the last closed.
    months.slice(1).forEach((m, i) => {
      expect(m.openingDebt).toBe(months[i].closingDebt);
    });
  };

  const setup = (students: any[], transactions: any[]) => {
    prisma.student.findMany
      .mockResolvedValueOnce(students) // the replay roster
      .mockResolvedValue(
        students.map((s) => ({
          id: s.id,
          firstName: `F${s.id}`,
          lastName: `L${s.id}`,
          phone: null,
          enrollments: [],
        })),
      );
    prisma.transaction.findMany.mockResolvedValue(transactions);
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00+05:00'));
    prisma = {
      company: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ systemStartDate: new Date('2026-05-01') }),
      },
      student: { findMany: jest.fn() },
      transaction: { findMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsDebtHistoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ReportsDebtHistoryService);
  });

  afterEach(() => jest.useRealTimers());

  it('splits a month by CAUSE and foots', async () => {
    // One student: billed 300k in May (debt 300k), pays 100k in June.
    setup(
      [student(10001, -200_000)],
      [
        tx(10001, 'LESSON_DEDUCTION', -300_000, at('2026-05', 10)),
        tx(10001, 'PAYMENT', 100_000, at('2026-06', 5)),
      ],
    );

    const res = await service.getDebtHistory(1, null);
    const [may, june, july] = res.months;

    expect(may.debtAdded).toBe(300_000);
    expect(may.closingDebt).toBe(300_000);
    expect(june.debtPaid).toBe(100_000);
    expect(june.closingDebt).toBe(200_000);
    // Nothing happened in July — the balance carries, no flow is invented.
    expect(july.closingDebt).toBe(200_000);
    expect(july.debtAdded + july.debtPaid).toBe(0);
    expectFoots(res.months);
  });

  it('counts a write-off and an adjustment in their own columns, not as payment', async () => {
    setup(
      [student(10001, 0)],
      [
        tx(10001, 'LESSON_DEDUCTION', -300_000, at('2026-05', 10)),
        tx(10001, 'DEBT_WRITE_OFF', 100_000, at('2026-06', 5)),
        tx(10001, 'ADJUSTMENT', 200_000, at('2026-06', 6)),
      ],
    );

    const res = await service.getDebtHistory(1, null);
    const june = res.months[1];

    expect(june.debtForgiven).toBe(100_000);
    expect(june.debtOther).toBe(200_000);
    // The money the centre actually collected must stay clean of both.
    expect(june.debtPaid).toBe(0);
    expect(june.closingDebt).toBe(0);
    expectFoots(res.months);
  });

  it('charges against a positive balance add NO debt', async () => {
    // Prepaid 500k, then billed 300k — the student never owes anything, so the
    // month must not report 300k of "new debt" against 0 closing debt.
    setup(
      [student(10001, 200_000)],
      [
        tx(10001, 'PAYMENT', 500_000, at('2026-05', 1)),
        tx(10001, 'LESSON_DEDUCTION', -300_000, at('2026-05', 10)),
      ],
    );

    const res = await service.getDebtHistory(1, null);
    expect(res.months[0].debtAdded).toBe(0);
    expect(res.months[0].debtPaid).toBe(0);
    expect(res.months[0].closingDebt).toBe(0);
    expect(res.current.debt).toBe(0);
    expectFoots(res.months);
  });

  it('bills only the UNCOVERED part when a charge straddles zero', async () => {
    // Balance +100k, billed 300k → 200k of new debt, not 300k.
    setup(
      [student(10001, -200_000)],
      [
        tx(10001, 'PAYMENT', 100_000, at('2026-05', 1)),
        tx(10001, 'LESSON_DEDUCTION', -300_000, at('2026-05', 10)),
      ],
    );

    const res = await service.getDebtHistory(1, null);
    expect(res.months[0].debtAdded).toBe(200_000);
    expect(res.months[0].closingDebt).toBe(200_000);
    expectFoots(res.months);
  });

  it('a reversed payment and its counter-row net to zero', async () => {
    // `reverseTransaction` writes the counter-row with the ORIGINAL's type.
    // Filtering either half out is the defect this asserts against.
    setup(
      [student(10001, -300_000)],
      [
        tx(10001, 'LESSON_DEDUCTION', -300_000, at('2026-05', 10)),
        tx(10001, 'PAYMENT', 100_000, at('2026-06', 5)),
        tx(10001, 'PAYMENT', -100_000, at('2026-06', 6)), // the reversal
      ],
    );

    const res = await service.getDebtHistory(1, null);
    const june = res.months[1];

    expect(june.debtPaid).toBe(100_000);
    expect(june.debtAdded).toBe(100_000); // the rollback re-opened the debt
    expect(june.closingDebt).toBe(300_000);
    expectFoots(res.months);
  });

  describe('cohort legs', () => {
    it('caps recovery at that month`s debt and reports today`s debt apart', async () => {
      // Owes 200k at end of May; in June pays 500k but is billed 600k more.
      // May's cohort recovery is capped at 200k, yet they owe 300k TODAY.
      setup(
        [student(10001, -300_000)],
        [
          tx(10001, 'LESSON_DEDUCTION', -200_000, at('2026-05', 10)),
          tx(10001, 'PAYMENT', 500_000, at('2026-06', 5)),
          tx(10001, 'LESSON_DEDUCTION', -600_000, at('2026-06', 20)),
        ],
      );

      const res = await service.getDebtHistory(1, null);
      const may = res.months[0];

      expect(may.debtorCount).toBe(1);
      expect(may.recovered).toBe(200_000); // capped, not 500 000
      expect(may.remaining).toBe(0);
      // The number that stops "remaining: 0" from being read as "settled".
      expect(may.cohortDebtNow).toBe(300_000);
      expect(may.cohortDebtorsNow).toBe(1);
    });

    it('totals expose FLOW columns only — never a sum of month-end balances', async () => {
      setup(
        [student(10001, -100_000)],
        [tx(10001, 'LESSON_DEDUCTION', -100_000, at('2026-05', 10))],
      );

      const res = await service.getDebtHistory(1, null);
      expect(Object.keys(res.totals).sort()).toEqual([
        'debtAdded',
        'debtForgiven',
        'debtOther',
        'debtPaid',
      ]);
      // The same 100 000 stands at the end of all three months...
      expect(res.months.map((m) => m.closingDebt)).toEqual([
        100_000, 100_000, 100_000,
      ]);
      // ...but it was ADDED once.
      expect(res.totals.debtAdded).toBe(100_000);
    });
  });

  describe('status split and filter', () => {
    const roster = [
      student(10001, -100_000),
      student(10002, -400_000, { status: 'EXPELLED' }),
      student(10003, -50_000, { status: 'ACTIVE', deletedAt: new Date() }),
      student(10004, 25_000), // in credit — never a debtor
    ];
    const ledger = [
      tx(10001, 'LESSON_DEDUCTION', -100_000, at('2026-05', 10)),
      tx(10002, 'LESSON_DEDUCTION', -400_000, at('2026-05', 10)),
      tx(10003, 'LESSON_DEDUCTION', -50_000, at('2026-05', 10)),
      tx(10004, 'PAYMENT', 25_000, at('2026-05', 10)),
    ];

    it('reports every slice of the split regardless of the active filter', async () => {
      setup(roster, ledger);
      const res = await service.getDebtHistory(1, null, 'active');

      // The card doubles as the filter control, so it must keep showing the
      // slices the filter excludes — otherwise you cannot switch back to them.
      const labels = res.current.byStatus.map((s) => s.status).sort();
      expect(labels).toEqual(['ACTIVE', 'ARCHIVED_SOFT', 'EXPELLED']);
      const expelled = res.current.byStatus.find(
        (s) => s.status === 'EXPELLED',
      );
      expect(expelled?.amount).toBe(400_000);
      expect(expelled?.count).toBe(1);
    });

    it('the filter narrows the tables — `active` excludes expelled and archived', async () => {
      setup(roster, ledger);
      const res = await service.getDebtHistory(1, null, 'active');
      expect(res.current.debt).toBe(100_000);
      expect(res.current.debtorCount).toBe(1);
      expectFoots(res.months);
    });

    it('`inactive` is the exact complement of `active`', async () => {
      setup(roster, ledger);
      const res = await service.getDebtHistory(1, null, 'inactive');
      expect(res.current.debt).toBe(450_000); // expelled + soft-archived
      expect(res.current.debtorCount).toBe(2);
      expectFoots(res.months);
    });
  });

  describe('longest-standing debtors', () => {
    it('measures the UNBROKEN streak — clearing the balance restarts it', async () => {
      setup(
        [student(10001, -100_000), student(10002, -100_000)],
        [
          // 10001: in debt since May, never cleared.
          tx(10001, 'LESSON_DEDUCTION', -100_000, at('2026-05', 10)),
          // 10002: owed in May, PAID IT OFF, fell back into debt in July.
          tx(10002, 'LESSON_DEDUCTION', -100_000, at('2026-05', 10)),
          tx(10002, 'PAYMENT', 100_000, at('2026-05', 20)),
          tx(10002, 'LESSON_DEDUCTION', -100_000, at('2026-07', 1)),
        ],
      );

      const res = await service.getDebtHistory(1, null);
      const [first, second] = res.longestDebtors;

      expect(first.id).toBe(10001);
      expect(first.sinceMonthKey).toBe('2026-05');
      expect(first.monthsInDebt).toBe(2); // 10 May → 15 July
      expect(second.id).toBe(10002);
      expect(second.sinceMonthKey).toBe('2026-07');
      expect(second.monthsInDebt).toBe(0);
    });

    it('leaves out students who owe nothing today', async () => {
      setup(
        [student(10001, 0)],
        [
          tx(10001, 'LESSON_DEDUCTION', -100_000, at('2026-05', 10)),
          tx(10001, 'PAYMENT', 100_000, at('2026-06', 1)),
        ],
      );
      const res = await service.getDebtHistory(1, null);
      expect(res.longestDebtors).toEqual([]);
    });
  });

  describe('debt aging — today\'s debt, split by the month it arose in', () => {
    it('splits ONE student across the months their unpaid charges landed in', async () => {
      // The defect this replaced: a frozen debtor showed the same cumulative
      // figure under every month, so "how much of this is June's?" had no
      // answer. #10399 read 815 163 under both June and July in production.
      setup(
        [student(10001, -300_000)],
        [
          tx(10001, 'LESSON_DEDUCTION', -100_000, at('2026-05', 10)),
          tx(10001, 'LESSON_DEDUCTION', -200_000, at('2026-06', 10)),
        ],
      );

      const res = await service.getDebtHistory(1, null);
      const [may, june, july] = res.months;

      expect(may.agedDebt).toBe(100_000);
      expect(june.agedDebt).toBe(200_000);
      expect(july.agedDebt).toBe(0); // nothing new was billed in July
      expect(may.agedDebtorCount).toBe(1);
      expect(july.agedDebtorCount).toBe(0);
      // The month's OWN figure matches here because nothing was repaid.
      expect(may.monthDebt).toBe(100_000);
      expect(june.monthDebt).toBe(200_000);
    });

    it('the buckets sum EXACTLY to today\'s debt — which is what lets the table total', async () => {
      setup(
        [student(10001, -250_000), student(10002, -50_000)],
        [
          tx(10001, 'LESSON_DEDUCTION', -100_000, at('2026-05', 10)),
          tx(10001, 'LESSON_DEDUCTION', -150_000, at('2026-07', 3)),
          tx(10002, 'LESSON_DEDUCTION', -50_000, at('2026-06', 8)),
        ],
      );

      const res = await service.getDebtHistory(1, null);
      const sum = res.months.reduce((a, m) => a + m.agedDebt, 0);

      expect(sum).toBe(res.current.debt);
      expect(sum).toBe(300_000);
      // Shares are of that same total, so they close on 100.
      expect(
        res.months.reduce((a, m) => a + m.agedShare, 0),
      ).toBeCloseTo(100, 1);
    });

    it("the month's OWN debt does not shrink when the student later pays", async () => {
      // A month's debt is a property of that month. Reporting only the unpaid
      // remainder there would make May's figure fall every time someone paid,
      // so the two live in separate columns.
      setup(
        [student(10001, 0)],
        [
          tx(10001, 'LESSON_DEDUCTION', -100_000, at('2026-05', 10)),
          tx(10001, 'PAYMENT', 100_000, at('2026-06', 1)),
        ],
      );

      const res = await service.getDebtHistory(1, null);
      expect(res.months[0].monthDebt).toBe(100_000); // still May's debt
      expect(res.months[0].monthUnpaid).toBe(0); // …but nothing is outstanding
      expect(res.current.debt).toBe(0);
    });

    it('a payment clears the OLDEST month first', async () => {
      // Oldest-first is how the billing engine settles, so the aging must not
      // invent a different order — otherwise May would look unpaid forever.
      setup(
        [student(10001, -50_000)],
        [
          tx(10001, 'LESSON_DEDUCTION', -100_000, at('2026-05', 10)),
          tx(10001, 'LESSON_DEDUCTION', -100_000, at('2026-06', 10)),
          tx(10001, 'PAYMENT', 150_000, at('2026-07', 1)),
        ],
      );

      const res = await service.getDebtHistory(1, null);
      expect(res.months[0].agedDebt).toBe(0); // May fully cleared
      expect(res.months[1].agedDebt).toBe(50_000); // June partly
    });

    it('a charge an advance already covered creates NO aged debt', async () => {
      setup(
        [student(10001, 200_000)],
        [
          tx(10001, 'PAYMENT', 500_000, at('2026-05', 1)),
          tx(10001, 'LESSON_DEDUCTION', -300_000, at('2026-06', 10)),
        ],
      );

      const res = await service.getDebtHistory(1, null);
      expect(res.months.every((m) => m.agedDebt === 0)).toBe(true);
      expect(res.current.debt).toBe(0);
    });
  });

  describe('getMonthAgingDetail', () => {
    it('reports the month\'s own share and flags the debt held in other months', async () => {
      prisma.student.findMany
        .mockResolvedValueOnce([student(10001, -300_000)]) // roster
        .mockResolvedValueOnce([
          {
            id: 10001,
            firstName: 'Ali',
            lastName: 'Valiyev',
            phone: '901234567',
            enrollments: [{ group: { name: 'A1-01' } }],
          },
        ]);
      prisma.transaction.findMany
        .mockResolvedValueOnce([
          tx(10001, 'LESSON_DEDUCTION', -100_000, at('2026-05', 10)),
          tx(10001, 'LESSON_DEDUCTION', -200_000, at('2026-06', 10)),
        ])
        .mockResolvedValueOnce([]); // write-offs

      const res = await service.getMonthAgingDetail(1, '2026-06', null);

      // `debt` IS the outstanding figure — the single number the month row
      // shows, so the dialog and the table can never disagree.
      expect(res.totals).toEqual({
        debt: 200_000,
        debtorCount: 1,
        unpaid: 200_000,
        unpaidDebtorCount: 1,
      });
      const [d] = res.debtors;
      expect(d.monthDebt).toBe(200_000); // debt created in June
      expect(d.monthUnpaid).toBe(200_000); // none of it settled
      expect(d.totalDebt).toBe(300_000); // everything they owe
      expect(d.otherMonths).toEqual([
        { monthKey: '2026-05', label: 'May 2026', amount: 100_000 },
      ]);
    });

    it('DROPS a student who has since paid the month off', async () => {
      // The page reports one figure per month — what is still owed from it. A
      // student who settled is not a debtor, so keeping them on the list would
      // put a zero row under a total they contribute nothing to.
      prisma.student.findMany
        .mockResolvedValueOnce([student(10001, 0)])
        .mockResolvedValue([]);
      prisma.transaction.findMany
        .mockResolvedValueOnce([
          tx(10001, 'LESSON_DEDUCTION', -100_000, at('2026-06', 10)),
          tx(10001, 'PAYMENT', 100_000, at('2026-07', 1)),
        ])
        .mockResolvedValueOnce([]);

      const res = await service.getMonthAgingDetail(1, '2026-06', null);

      expect(res.debtors).toEqual([]);
      expect(res.totals.debt).toBe(0);
      expect(res.totals.debtorCount).toBe(0);
    });

    it('leaves out a student whose debt came from a different month', async () => {
      prisma.student.findMany
        .mockResolvedValueOnce([student(10001, -100_000)])
        .mockResolvedValue([]);
      prisma.transaction.findMany
        .mockResolvedValueOnce([
          tx(10001, 'LESSON_DEDUCTION', -100_000, at('2026-05', 10)),
        ])
        .mockResolvedValueOnce([]);

      const res = await service.getMonthAgingDetail(1, '2026-07', null);
      expect(res.debtors).toEqual([]);
      expect(res.totals.debt).toBe(0);
    });
  });

  it('marks only the unfinished month as current', async () => {
    setup([student(10001, 0)], []);
    const res = await service.getDebtHistory(1, null);
    expect(res.months.map((m) => m.monthKey)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
    expect(res.months.map((m) => m.isCurrent)).toEqual([false, false, true]);
  });

  it('returns a zero-filled skeleton (not an empty page) when nobody matches', async () => {
    setup([], []);
    const res = await service.getDebtHistory(1, null);
    expect(res.months).toHaveLength(3);
    expect(res.current.debt).toBe(0);
    expect(res.longestDebtors).toEqual([]);
    expectFoots(res.months);
  });
});
