import { resolveMonthlyScope } from './resolve-monthly-scope';

/**
 * The monthly salary report can be scoped to a SINGLE user so the teacher
 * profile, the profile card and the lehrer portal all read the exact row the
 * `/payments/salary` table shows. Branch scoping still protects a Branch
 * Director from seeing another branch's teacher — except when the caller is
 * looking at their own row, which must never be filtered away by branch
 * bookkeeping.
 */
describe('resolveMonthlyScope — userId scoping', () => {
  const makePrisma = (caller: {
    mainBranch: number | null;
    roles: { role: { name: string } }[];
  }) =>
    ({
      company: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ systemStartDate: new Date('2026-05-01') }),
      },
      salaryPeriodSetting: {
        findFirst: jest.fn().mockResolvedValue({ cycleStartDay: 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(caller) },
    }) as any;

  const bd = { mainBranch: 7, roles: [{ role: { name: 'Branch Director' } }] };
  const teacher = { mainBranch: 7, roles: [{ role: { name: 'Teacher' } }] };

  it('carries userId into the scope so the roster can be narrowed to one row', async () => {
    const scope = await resolveMonthlyScope(
      makePrisma(bd),
      { month: '2026-07', userId: 10005 },
      1,
      999,
    );

    expect(scope.userId).toBe(10005);
  });

  it('leaves userId undefined for the full-table report', async () => {
    const scope = await resolveMonthlyScope(
      makePrisma(bd),
      { month: '2026-07' },
      1,
      999,
    );

    expect(scope.userId).toBeUndefined();
  });

  it('keeps branch scoping when a Branch Director requests another user', async () => {
    const scope = await resolveMonthlyScope(
      makePrisma(bd),
      { month: '2026-07', userId: 10005 },
      1,
      999,
    );

    expect(scope.branchId).toBe(7);
  });

  it('drops branch scoping when the caller requests their OWN row', async () => {
    // A teacher viewing "Mening oyligim": their UserBranch rows are irrelevant —
    // an id-exact lookup of themselves must never come back empty because of a
    // branch mismatch.
    const scope = await resolveMonthlyScope(
      makePrisma(teacher),
      { month: '2026-07', userId: 10005 },
      1,
      10005,
    );

    expect(scope.branchId).toBeUndefined();
  });
});

/**
 * The «Foyda» card must subtract THAT branch's payroll from THAT branch's
 * revenue. It used to subtract the whole company's, so a freshly-opened branch
 * with small revenue looked catastrophically unprofitable. A requested branch
 * may therefore NARROW the report — but never widen it past the caller's own
 * confinement.
 */
describe('resolveMonthlyScope — branchId narrowing', () => {
  const makePrisma = (caller: {
    mainBranch: number | null;
    roles: { role: { name: string } }[];
  }) =>
    ({
      company: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ systemStartDate: new Date('2026-05-01') }),
      },
      salaryPeriodSetting: {
        findFirst: jest.fn().mockResolvedValue({ cycleStartDay: 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(caller) },
    }) as any;

  const ceo = { mainBranch: null, roles: [{ role: { name: 'CEO' } }] };
  const bdOfSeven = {
    mainBranch: 7,
    roles: [{ role: { name: 'Branch Director' } }],
  };

  it('lets a CEO narrow to one branch', async () => {
    const scope = await resolveMonthlyScope(
      makePrisma(ceo),
      { month: '2026-07', branchId: 2 },
      1,
      999,
    );
    expect(scope.branchId).toBe(2);
    expect(scope.blocked).toBe(false);
  });

  it('leaves a CEO unscoped when no branch is requested', async () => {
    const scope = await resolveMonthlyScope(
      makePrisma(ceo),
      { month: '2026-07' },
      1,
      999,
    );
    expect(scope.branchId).toBeUndefined();
  });

  it('keeps a director pinned to their own branch when they ask for it', async () => {
    const scope = await resolveMonthlyScope(
      makePrisma(bdOfSeven),
      { month: '2026-07', branchId: 7 },
      1,
      999,
    );
    expect(scope.branchId).toBe(7);
    expect(scope.blocked).toBe(false);
  });

  it('blocks a director who requests another branch — narrowing only, never widening', async () => {
    const scope = await resolveMonthlyScope(
      makePrisma(bdOfSeven),
      { month: '2026-07', branchId: 2 },
      1,
      999,
    );
    expect(scope.blocked).toBe(true);
  });

  it('blocks a branch-confined caller with no branch at all', async () => {
    const scope = await resolveMonthlyScope(
      makePrisma({
        mainBranch: null,
        roles: [{ role: { name: 'Branch Director' } }],
      }),
      { month: '2026-07' },
      1,
      999,
    );
    expect(scope.blocked).toBe(true);
    expect(scope.branchId).toBeUndefined();
  });
});
