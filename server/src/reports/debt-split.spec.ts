import { activeStudentWhere } from '../students/shared/active-student-where';
import { splitDebt, loadDebtSplit } from './debt-split';

describe('splitDebt', () => {
  it('a studying debtor: debt up to this month is «shu oy», the rest «eski»', () => {
    const r = splitDebt({
      studying: [
        { id: 1, balance: -100_000 },
        { id: 2, balance: -600_000 },
      ],
      chargedThisMonth: new Map([
        [1, 450_000],
        [2, 450_000],
      ]),
      notStudying: { sum: -250_000, count: 3 },
    });
    expect(r).toEqual({
      studying: {
        total: 700_000,
        count: 2,
        currentMonth: 100_000 + 450_000,
        older: 150_000,
      },
      notStudying: { total: 250_000, count: 3 },
    });
  });

  it('a studying debtor with no charge this month: all of it is «eski»', () => {
    const r = splitDebt({
      studying: [{ id: 1, balance: -80_000 }],
      chargedThisMonth: new Map(),
      notStudying: { sum: 0, count: 0 },
    });
    expect(r.studying).toEqual({
      total: 80_000,
      count: 1,
      currentMonth: 0,
      older: 80_000,
    });
  });

  it('nobody owes → zeros', () => {
    const r = splitDebt({
      studying: [],
      chargedThisMonth: new Map(),
      notStudying: { sum: null, count: 0 },
    });
    expect(r).toEqual({
      studying: { total: 0, count: 0, currentMonth: 0, older: 0 },
      notStudying: { total: 0, count: 0 },
    });
  });
});

describe('loadDebtSplit', () => {
  it('reads studying debtors by the faol-o‘quvchi rule and everyone else as not studying', async () => {
    const prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([{ id: 5, balance: -300_000 }]),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { balance: -90_000 }, _count: 2 }),
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
    expect(prisma.student.aggregate.mock.calls[0][0].where.NOT).toBeDefined();
    expect(r.studying).toEqual({
      total: 300_000,
      count: 1,
      currentMonth: 300_000,
      older: 0,
    });
    expect(r.notStudying).toEqual({ total: 90_000, count: 2 });
  });

  describe('what the three reads filter on', () => {
    const makeDb = () => ({
      student: {
        findMany: jest.fn().mockResolvedValue([{ id: 5, balance: -300_000 }]),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { balance: null }, _count: 0 }),
      },
      enrollmentMonthlyCharge: { groupBy: jest.fn().mockResolvedValue([]) },
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
      const notStudying = prisma.student.aggregate.mock.calls[0][0].where;
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
      expect(scoped.student.aggregate.mock.calls[0][0].where.branches).toEqual(
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
        everyone.student.aggregate.mock.calls[0][0].where.branches,
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
      expect(nobody.student.aggregate.mock.calls[0][0].where.branches).toEqual(
        matchesNothing,
      );
    });

    it("the charges read is chained to the studying debtors: that month's CHARGED charges, no branch of its own", async () => {
      const prisma = makeDb();
      await loadDebtSplit(prisma as never, 1, {
        branchIds: [4],
        month: '2026-10',
      });
      // `toEqual` pins that it carries NO `branchId`: the balance is one, so
      // the charge of a student the scoped read returned counts in any branch.
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
