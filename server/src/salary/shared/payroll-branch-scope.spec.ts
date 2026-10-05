import { resolvePayrollBranchScope } from './payroll-branch-scope';

function prismaWith(
  user: {
    mainBranch: number | null;
    roles: string[];
    /** `UserBranch` rows, in whatever order the database returns them. */
    branches?: number[];
  } | null,
) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(
        user
          ? {
              mainBranch: user.mainBranch,
              branches: (user.branches ?? []).map((branchId) => ({ branchId })),
              roles: user.roles.map((name) => ({ role: { name } })),
            }
          : null,
      ),
    },
  } as any;
}

/**
 * Payroll scope must fail CLOSED. Both the monthly report and `batchPay` used
 * to turn a missing `mainBranch` into "no filter", so a branch-confined caller
 * saw — and could pay — every branch's salaries. Two Administrators were in
 * exactly that state in production.
 */
describe('resolvePayrollBranchScope', () => {
  it('gives a CEO every branch', async () => {
    const scope = await resolvePayrollBranchScope(
      prismaWith({ mainBranch: null, roles: ['CEO'] }),
      10000,
    );
    expect(scope).toEqual({ kind: 'all' });
  });

  it('confines a single-branch Branch Director to their own branch', async () => {
    const scope = await resolvePayrollBranchScope(
      prismaWith({ mainBranch: 2, roles: ['Branch Director'] }),
      10012,
    );
    expect(scope).toEqual({
      kind: 'branches',
      branchIds: [2],
      mainBranch: 2,
    });
  });

  it('gives a director attached to several branches every one of them (A2.8)', async () => {
    // `UserBranch` rows come back in any order and include the main branch.
    const scope = await resolvePayrollBranchScope(
      prismaWith({
        mainBranch: 1,
        branches: [2, 1],
        roles: ['Branch Director'],
      }),
      10012,
    );
    expect(scope).toEqual({
      kind: 'branches',
      branchIds: [1, 2],
      mainBranch: 1,
    });
  });

  it('counts a branch attached only through UserBranch, sorted so the fallback does not depend on row order', async () => {
    const scope = await resolvePayrollBranchScope(
      prismaWith({
        mainBranch: null,
        branches: [3, 2],
        roles: ['Administrator'],
      }),
      10030,
    );
    expect(scope).toEqual({
      kind: 'branches',
      branchIds: [2, 3],
      mainBranch: null,
    });
  });

  it('asks the database for the UserBranch rows', async () => {
    // A mocked `findUnique` returns whatever the test hands it, so only the
    // `select` shows that the real query reads `UserBranch` at all. Without
    // it a multi-branch director would silently stay on `mainBranch`.
    const prisma = prismaWith({ mainBranch: 1, roles: ['Branch Director'] });
    await resolvePayrollBranchScope(prisma, 10012);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          mainBranch: true,
          branches: { select: { branchId: true } },
        }),
      }),
    );
  });

  it('blocks a confined caller whose branch is unknown (fail closed)', async () => {
    const scope = await resolvePayrollBranchScope(
      prismaWith({ mainBranch: null, roles: ['Branch Director'] }),
      10012,
    );
    expect(scope).toEqual({ kind: 'none' });
  });

  it('blocks an unknown user rather than defaulting to everything', async () => {
    const scope = await resolvePayrollBranchScope(prismaWith(null), 99999);
    expect(scope).toEqual({ kind: 'none' });
  });

  it('lets anyone look at their own row regardless of branch', async () => {
    const scope = await resolvePayrollBranchScope(
      prismaWith({ mainBranch: null, roles: ['Teacher'] }),
      10001,
      { selfView: true },
    );
    expect(scope).toEqual({ kind: 'all' });
  });
});
