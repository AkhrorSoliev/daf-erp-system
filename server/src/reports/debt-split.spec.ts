import { Prisma, StudentStatus } from '@prisma/client';
import {
  ACTIVE_ENROLLMENT_WHERE,
  activeStudentWhere,
  ungroupedStudentWhere,
} from '../students/shared/active-student-where';
import {
  debtKindOf,
  debtRows,
  debtTabAmount,
  loadDebtRows,
  loadDebtSplit,
  splitDebt,
  studyingDebtorWhere,
  sumDebtRows,
  type DebtTab,
} from './debt-split';

const ZERO = { total: 0, count: 0 };

describe('studyingDebtorWhere', () => {
  it('is a live card owing money, in scope, by the faol-o‘quvchi rule — nothing else', () => {
    expect(studyingDebtorWhere(1, null)).toEqual({
      companyId: 1,
      deletedAt: null,
      balance: { lt: 0 },
      ...activeStudentWhere(),
    });
    expect(studyingDebtorWhere(1, [4]).branches).toEqual({
      some: { branchId: { in: [4] } },
    });
  });
});

describe('splitDebt', () => {
  it('a studying debtor: debt up to this month is «shu oy», the rest «eski qarz»', () => {
    const r = splitDebt({
      studying: [
        { id: 1, balance: -100_000 },
        { id: 2, balance: -600_000 },
      ],
      chargedThisMonth: new Map([
        [1, 450_000],
        [2, 450_000],
      ]),
      notStudying: [
        { id: 7, balance: -100_000, status: 'FROZEN' },
        { id: 8, balance: -100_000, status: 'FROZEN' },
        { id: 9, balance: -50_000, status: 'FROZEN' },
      ],
    });
    expect(r).toEqual({
      studying: {
        total: 700_000,
        count: 2,
        currentMonth: 100_000 + 450_000,
        currentMonthCount: 2,
        older: 150_000,
        olderCount: 1,
      },
      notStudying: {
        total: 250_000,
        count: 3,
        currentMonth: 0,
        byKind: {
          ungrouped: ZERO,
          frozen: { total: 250_000, count: 3 },
          left: ZERO,
        },
      },
    });
  });

  it('a studying debtor with no charge this month: all of it is «eski qarz»', () => {
    const r = splitDebt({
      studying: [{ id: 1, balance: -80_000 }],
      chargedThisMonth: new Map(),
      notStudying: [],
    });
    expect(r.studying).toEqual({
      total: 80_000,
      count: 1,
      currentMonth: 0,
      currentMonthCount: 0,
      older: 80_000,
      olderCount: 1,
    });
  });

  it("counts as «eski qarz» only the debtors whose debt is above this month's charges", () => {
    const r = splitDebt({
      studying: [
        { id: 1, balance: -450_000 }, // exactly this month's charge
        { id: 2, balance: -100_000 }, // part of it
        { id: 3, balance: -451_000 }, // 1 000 older
      ],
      chargedThisMonth: new Map([
        [1, 450_000],
        [2, 450_000],
        [3, 450_000],
      ]),
      notStudying: [],
    });
    expect(r.studying.older).toBe(1_000);
    expect(r.studying.olderCount).toBe(1);
  });

  it('nobody owes → zeros', () => {
    const r = splitDebt({
      studying: [],
      chargedThisMonth: new Map(),
      notStudying: [],
    });
    expect(r).toEqual({
      studying: {
        total: 0,
        count: 0,
        currentMonth: 0,
        currentMonthCount: 0,
        older: 0,
        olderCount: 0,
      },
      notStudying: {
        total: 0,
        count: 0,
        currentMonth: 0,
        byKind: { ungrouped: ZERO, frozen: ZERO, left: ZERO },
      },
    });
  });

  it('names every not-studying status — ACTIVE guruhsiz, FROZEN muzlatilgan, the rest ketgan — and the parts add up', () => {
    const r = splitDebt({
      studying: [],
      chargedThisMonth: new Map(),
      notStudying: [
        ...[100, 101, 102, 103].map((id) => ({
          id,
          balance: -320_000,
          status: 'ACTIVE',
        })),
        ...[200, 201, 202].map((id) => ({
          id,
          balance: -330_000,
          status: 'FROZEN',
        })),
        { id: 300, balance: -300_000, status: 'EXPELLED' },
        { id: 301, balance: -300_000, status: 'EXPELLED' },
        { id: 400, balance: -30_000, status: 'GRADUATED' },
        { id: 500, balance: -20_000, status: 'INACTIVE' },
        { id: 600, balance: -5_000, status: 'ARCHIVED' },
        { id: 700, balance: -1_000, status: 'PROSPECT' },
      ],
    });
    const { byKind } = r.notStudying;
    expect(byKind).toEqual({
      ungrouped: { total: 1_280_000, count: 4 },
      frozen: { total: 990_000, count: 3 },
      left: { total: 656_000, count: 6 },
    });
    expect(
      byKind.ungrouped.total + byKind.frozen.total + byKind.left.total,
    ).toBe(r.notStudying.total);
    expect(
      byKind.ungrouped.count + byKind.frozen.count + byKind.left.count,
    ).toBe(r.notStudying.count);
    expect(r.notStudying).toMatchObject({ total: 2_926_000, count: 13 });
  });
});

describe('debtRows / debtTabAmount — the one tab rule (ADR-0072)', () => {
  const rows = debtRows({
    studying: [
      { id: 1, balance: -600_000 }, // both parts: 450 000 shu oy, 150 000 eski
      { id: 2, balance: -100_000 }, // shu oy only
      { id: 3, balance: -80_000 }, // nothing charged this month: eski only
    ],
    notStudying: [
      { id: 4, balance: -300_000, status: 'FROZEN' },
      { id: 5, balance: -50_000, status: 'EXPELLED' },
    ],
    chargedThisMonth: new Map([
      [1, 450_000],
      [2, 450_000],
      [4, 200_000],
    ]),
  });
  const tab = (t: DebtTab) =>
    rows
      .filter((r) => debtTabAmount(r, t) > 0)
      .map((r) => [r.studentId, debtTabAmount(r, t)]);

  it('a studying debtor with both parts is in both studying tabs, each with its own part', () => {
    expect(tab('shu-oy')).toEqual([
      [1, 450_000],
      [2, 100_000],
    ]);
    expect(tab('eski')).toEqual([
      [1, 150_000],
      [3, 80_000],
    ]);
  });

  it("a not-studying debtor is only in O'qimayotganlar, with the whole debt and its kind", () => {
    expect(tab('chiqqan')).toEqual([
      [4, 300_000],
      [5, 50_000],
    ]);
    expect(rows.find((r) => r.studentId === 4)).toMatchObject({
      kind: 'frozen',
      currentMonth: 200_000,
    });
    expect(rows.find((r) => r.studentId === 5)?.kind).toBe('left');
  });

  it('every total is the sum of its tab rows, the two new fields included', () => {
    const s = sumDebtRows(rows);
    const sum = (t: DebtTab) => tab(t).reduce((a, [, v]) => a + v, 0);
    expect(s.studying.currentMonth).toBe(sum('shu-oy'));
    expect(s.studying.currentMonthCount).toBe(tab('shu-oy').length);
    expect(s.studying.older).toBe(sum('eski'));
    expect(s.studying.olderCount).toBe(tab('eski').length);
    expect(s.notStudying.total).toBe(sum('chiqqan'));
    expect(s.notStudying.count).toBe(tab('chiqqan').length);
    expect(s.notStudying.currentMonth).toBe(200_000);
    // Student 4 has a charge this month: its kind still takes the whole debt.
    expect(s.notStudying.byKind.frozen).toEqual({ total: 300_000, count: 1 });
    expect(s.studying.total).toBe(780_000);
    expect(s.studying.currentMonth + s.studying.older).toBe(s.studying.total);
  });
});

/**
 * Evaluates the few where-shapes these predicates use against one student:
 * `status`, `enrollments.some` / `enrollments.none` of the one active-enrollment
 * shape, and `NOT`.
 */
function matches(
  where: Prisma.StudentWhereInput,
  s: { status: string; inActiveGroup: boolean },
): boolean {
  if (where.NOT && matches(where.NOT as Prisma.StudentWhereInput, s)) {
    return false;
  }
  if (where.status !== undefined && where.status !== s.status) return false;
  const e = where.enrollments as { some?: unknown; none?: unknown } | undefined;
  if (e?.some !== undefined && !s.inActiveGroup) return false;
  if (e?.none !== undefined && s.inActiveGroup) return false;
  return true;
}

describe('debtKindOf', () => {
  it('status ACTIVE inside the not-studying set is exactly ungroupedStudentWhere()', () => {
    // Both predicates name the SAME enrollment shape, so «in an active group»
    // means one thing on either side.
    expect((activeStudentWhere().enrollments as { some: unknown }).some).toBe(
      ACTIVE_ENROLLMENT_WHERE,
    );
    expect(
      (ungroupedStudentWhere().enrollments as { none: unknown }).none,
    ).toBe(ACTIVE_ENROLLMENT_WHERE);

    const notStudying: Prisma.StudentWhereInput = { NOT: activeStudentWhere() };
    for (const status of Object.values(StudentStatus)) {
      for (const inActiveGroup of [true, false]) {
        const s = { status, inActiveGroup };
        const namedUngrouped =
          matches(notStudying, s) && debtKindOf(status) === 'ungrouped';
        expect({ status, inActiveGroup, namedUngrouped }).toEqual({
          status,
          inActiveGroup,
          namedUngrouped: matches(ungroupedStudentWhere(), s),
        });
      }
    }
  });

  it('FROZEN is muzlatilgan and every other status is ketgan', () => {
    expect(debtKindOf('FROZEN')).toBe('frozen');
    for (const status of [
      'EXPELLED',
      'GRADUATED',
      'INACTIVE',
      'ARCHIVED',
      'PROSPECT',
    ]) {
      expect(debtKindOf(status)).toBe('left');
    }
  });
});

describe('loadDebtRows / loadDebtSplit', () => {
  const STUDYING = [{ id: 5, balance: -300_000 }];
  const NOT_STUDYING = [
    { id: 6, balance: -50_000, status: 'ACTIVE' },
    { id: 7, balance: -40_000, status: 'EXPELLED' },
  ];
  /** The two student reads differ by `NOT` (the not-studying predicate). */
  const makeDb = (studying = STUDYING, notStudying = NOT_STUDYING) => ({
    student: {
      findMany: jest.fn(
        (args: { where: Prisma.StudentWhereInput; select?: unknown }) =>
          Promise.resolve(args.where.NOT ? notStudying : studying),
      ),
    },
    enrollmentMonthlyCharge: {
      groupBy: jest.fn().mockResolvedValue([
        { studentId: 5, _sum: { chargedAmount: 450_000 } },
        { studentId: 6, _sum: { chargedAmount: 30_000 } },
      ]),
    },
  });
  const reads = (db: ReturnType<typeof makeDb>) => {
    const calls = db.student.findMany.mock.calls.map(([a]) => a);
    return {
      studying: calls.find((a) => !a.where.NOT)!,
      notStudying: calls.find((a) => a.where.NOT)!,
    };
  };

  it('returns one row per debtor and the totals summed from those rows', async () => {
    const { rows, split } = await loadDebtRows(makeDb() as never, 1, {
      branchIds: [4],
      month: '2026-10',
    });
    expect(rows).toEqual([
      {
        studentId: 5,
        debt: 300_000,
        currentMonth: 300_000,
        older: 0,
        kind: null,
      },
      {
        studentId: 6,
        debt: 50_000,
        currentMonth: 30_000,
        older: 20_000,
        kind: 'ungrouped',
      },
      {
        studentId: 7,
        debt: 40_000,
        currentMonth: 0,
        older: 40_000,
        kind: 'left',
      },
    ]);
    expect(split).toEqual(sumDebtRows(rows));
    expect(split.notStudying.currentMonth).toBe(30_000);
    expect(
      await loadDebtSplit(makeDb() as never, 1, {
        branchIds: [4],
        month: '2026-10',
      }),
    ).toEqual(split);
  });

  it('studying is the exported predicate; not studying is its complement, read per student with the status', async () => {
    const db = makeDb();
    await loadDebtRows(db as never, 1, { branchIds: null, month: '2026-10' });
    const { studying, notStudying } = reads(db);
    expect(studying.where).toEqual(studyingDebtorWhere(1, null));
    expect(studying.select).toEqual({ id: true, balance: true });
    expect(notStudying.where.NOT).toEqual(activeStudentWhere());
    expect(notStudying.where).toMatchObject({
      companyId: 1,
      deletedAt: null,
      balance: { lt: 0 },
    });
    expect(notStudying.select).toEqual({
      id: true,
      balance: true,
      status: true,
    });
  });

  it('the branch rides on both student reads; company-wide has none; an empty scope matches nothing', async () => {
    const cases: [number[] | null, unknown][] = [
      [[4], { some: { branchId: { in: [4] } } }],
      [null, undefined],
      [[], { some: { branchId: { in: [] } } }],
    ];
    for (const [branchIds, branches] of cases) {
      const db = makeDb();
      await loadDebtRows(db as never, 1, { branchIds, month: '2026-10' });
      expect(reads(db).studying.where.branches).toEqual(branches);
      expect(reads(db).notStudying.where.branches).toEqual(branches);
    }
  });

  it("the charges read covers every debtor — studying and not — that month's CHARGED charges, no branch", async () => {
    const db = makeDb();
    await loadDebtRows(db as never, 1, { branchIds: [4], month: '2026-10' });
    // `toEqual` pins that it carries NO `branchId`: the balance is one.
    expect(db.enrollmentMonthlyCharge.groupBy.mock.calls[0][0]).toEqual({
      by: ['studentId'],
      where: {
        companyId: 1,
        studentId: { in: [5, 6, 7] },
        periodYear: 2026,
        periodMonth: 10,
        status: 'CHARGED',
      },
      _sum: { chargedAmount: true },
    });
  });

  it('reads no charges when nobody owes', async () => {
    const db = makeDb([], []);
    const { rows, split } = await loadDebtRows(db as never, 1, {
      branchIds: null,
      month: '2026-10',
    });
    expect(db.enrollmentMonthlyCharge.groupBy).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
    expect(split.studying.total).toBe(0);
  });

  it('without a month it is the current TASHKENT month, not the UTC one', async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    jest.setSystemTime(new Date('2026-10-31T20:00:00Z')); // 01.11 01:00 in Tashkent
    try {
      const db = makeDb();
      await loadDebtRows(db as never, 1, { branchIds: null });
      expect(
        db.enrollmentMonthlyCharge.groupBy.mock.calls[0][0].where,
      ).toMatchObject({ periodYear: 2026, periodMonth: 11 });
    } finally {
      jest.useRealTimers();
    }
  });
});
