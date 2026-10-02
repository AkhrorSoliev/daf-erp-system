import { Prisma, StudentStatus } from '@prisma/client';
import {
  ACTIVE_ENROLLMENT_WHERE,
  activeStudentWhere,
  ungroupedStudentWhere,
} from '../students/shared/active-student-where';
import {
  debtKindOf,
  splitDebt,
  loadDebtSplit,
  studyingDebtorWhere,
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
      notStudying: [{ status: 'FROZEN', sum: -250_000, count: 3 }],
    });
    expect(r).toEqual({
      studying: {
        total: 700_000,
        count: 2,
        currentMonth: 100_000 + 450_000,
        older: 150_000,
        olderCount: 1,
      },
      notStudying: {
        total: 250_000,
        count: 3,
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
        older: 0,
        olderCount: 0,
      },
      notStudying: {
        total: 0,
        count: 0,
        byKind: { ungrouped: ZERO, frozen: ZERO, left: ZERO },
      },
    });
  });

  it('names every not-studying status — ACTIVE guruhsiz, FROZEN muzlatilgan, the rest ketgan — and the parts add up', () => {
    const r = splitDebt({
      studying: [],
      chargedThisMonth: new Map(),
      notStudying: [
        { status: 'ACTIVE', sum: -1_280_000, count: 4 },
        { status: 'FROZEN', sum: -990_000, count: 3 },
        { status: 'EXPELLED', sum: -600_000, count: 2 },
        { status: 'GRADUATED', sum: -30_000, count: 1 },
        { status: 'INACTIVE', sum: -20_000, count: 1 },
        { status: 'ARCHIVED', sum: -5_000, count: 1 },
        { status: 'PROSPECT', sum: -1_000, count: 1 },
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

describe('loadDebtSplit', () => {
  it('reads studying debtors by the faol-o‘quvchi rule and everyone else, by status, as not studying', async () => {
    const prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([{ id: 5, balance: -300_000 }]),
        groupBy: jest.fn().mockResolvedValue([
          { status: 'ACTIVE', _sum: { balance: -50_000 }, _count: { _all: 1 } },
          {
            status: 'EXPELLED',
            _sum: { balance: -40_000 },
            _count: { _all: 1 },
          },
        ]),
      },
      enrollmentMonthlyCharge: {
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { studentId: 5, _sum: { chargedAmount: 450_000 } },
          ]),
      },
    };
    const r = await loadDebtSplit(prisma as never, 1, {
      branchIds: [4],
      month: '2026-10',
    });
    const studyingWhere = prisma.student.findMany.mock.calls[0][0].where;
    expect(studyingWhere).toMatchObject({
      companyId: 1,
      deletedAt: null,
      balance: { lt: 0 },
      status: 'ACTIVE',
    });
    expect(studyingWhere.branches).toBeDefined(); // studentBranchWhere
    expect(prisma.student.groupBy.mock.calls[0][0]).toMatchObject({
      by: ['status'],
      _sum: { balance: true },
      _count: { _all: true },
    });
    expect(prisma.student.groupBy.mock.calls[0][0].where.NOT).toBeDefined();
    expect(r.studying).toEqual({
      total: 300_000,
      count: 1,
      currentMonth: 300_000,
      older: 0,
      olderCount: 0,
    });
    expect(r.notStudying).toEqual({
      total: 90_000,
      count: 2,
      byKind: {
        ungrouped: { total: 50_000, count: 1 },
        frozen: ZERO,
        left: { total: 40_000, count: 1 },
      },
    });
  });

  describe('what the three reads filter on', () => {
    const makeDb = () => ({
      student: {
        findMany: jest.fn().mockResolvedValue([{ id: 5, balance: -300_000 }]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      enrollmentMonthlyCharge: { groupBy: jest.fn().mockResolvedValue([]) },
    });

    it('reads the studying debtors with the exported predicate — the one /qarzdorlar lists by', async () => {
      const prisma = makeDb();
      await loadDebtSplit(prisma as never, 1, {
        branchIds: [4],
        month: '2026-10',
      });

      expect(prisma.student.findMany.mock.calls[0][0].where).toEqual(
        studyingDebtorWhere(1, [4]),
      );
    });

    it('both groups come from ONE rule: studying is it, not studying is its complement', async () => {
      const prisma = makeDb();
      await loadDebtSplit(prisma as never, 1, {
        branchIds: null,
        month: '2026-10',
      });
      // Same fragment on both sides, so no student can be in both or in
      // neither — and an archived card (deletedAt) is in neither.
      expect(prisma.student.findMany.mock.calls[0][0].where).toMatchObject(
        activeStudentWhere(),
      );
      const notStudying = prisma.student.groupBy.mock.calls[0][0].where;
      expect(notStudying.NOT).toEqual(activeStudentWhere());
      expect(notStudying).toMatchObject({
        companyId: 1,
        deletedAt: null,
        balance: { lt: 0 },
      });
    });

    it('the branch rides on both student reads; company-wide has none; an empty scope matches nothing', async () => {
      const scoped = makeDb();
      await loadDebtSplit(scoped as never, 1, {
        branchIds: [4],
        month: '2026-10',
      });
      const branch = { some: { branchId: { in: [4] } } };
      expect(scoped.student.findMany.mock.calls[0][0].where.branches).toEqual(
        branch,
      );
      expect(scoped.student.groupBy.mock.calls[0][0].where.branches).toEqual(
        branch,
      );

      const everyone = makeDb();
      await loadDebtSplit(everyone as never, 1, {
        branchIds: null,
        month: '2026-10',
      });
      expect(
        everyone.student.findMany.mock.calls[0][0].where.branches,
      ).toBeUndefined();
      expect(
        everyone.student.groupBy.mock.calls[0][0].where.branches,
      ).toBeUndefined();

      const nobody = makeDb();
      await loadDebtSplit(nobody as never, 1, {
        branchIds: [],
        month: '2026-10',
      });
      const matchesNothing = { some: { branchId: { in: [] } } };
      expect(nobody.student.findMany.mock.calls[0][0].where.branches).toEqual(
        matchesNothing,
      );
      expect(nobody.student.groupBy.mock.calls[0][0].where.branches).toEqual(
        matchesNothing,
      );
    });

    it("the charges read is chained to the studying debtors: that month's CHARGED charges, no branch of its own", async () => {
      const prisma = makeDb();
      await loadDebtSplit(prisma as never, 1, {
        branchIds: [4],
        month: '2026-10',
      });
      expect(
        prisma.enrollmentMonthlyCharge.groupBy.mock.calls[0][0],
      ).toMatchObject({
        by: ['studentId'],
        where: {
          companyId: 1,
          studentId: { in: [5] },
          periodYear: 2026,
          periodMonth: 10,
          status: 'CHARGED',
        },
      });
      // `toEqual` pins that it carries NO `branchId`: the balance is one, so
      // the charge of a student the scoped read returned counts in any branch.
      expect(
        prisma.enrollmentMonthlyCharge.groupBy.mock.calls[0][0].where,
      ).toEqual({
        companyId: 1,
        studentId: { in: [5] },
        periodYear: 2026,
        periodMonth: 10,
        status: 'CHARGED',
      });
    });

    it('reads no charges when nobody studying owes', async () => {
      const prisma = makeDb();
      prisma.student.findMany.mockResolvedValue([]);
      const r = await loadDebtSplit(prisma as never, 1, {
        branchIds: null,
        month: '2026-10',
      });
      expect(prisma.enrollmentMonthlyCharge.groupBy).not.toHaveBeenCalled();
      expect(r.studying).toEqual({
        total: 0,
        count: 0,
        currentMonth: 0,
        older: 0,
        olderCount: 0,
      });
    });

    describe('without a month', () => {
      afterEach(() => jest.useRealTimers());

      it('it is the current TASHKENT month, not the UTC one', async () => {
        // 31.10 20:00 UTC is already 01.11 01:00 in Tashkent.
        jest.useFakeTimers({
          doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
        });
        jest.setSystemTime(new Date('2026-10-31T20:00:00Z'));
        const prisma = makeDb();

        await loadDebtSplit(prisma as never, 1, { branchIds: null });

        expect(
          prisma.enrollmentMonthlyCharge.groupBy.mock.calls[0][0].where,
        ).toMatchObject({ periodYear: 2026, periodMonth: 11 });
      });
    });
  });
});
