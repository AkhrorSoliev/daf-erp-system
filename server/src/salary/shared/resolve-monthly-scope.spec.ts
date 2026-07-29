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
