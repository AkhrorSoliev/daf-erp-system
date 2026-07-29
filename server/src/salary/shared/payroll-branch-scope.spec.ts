import {
  resolvePayrollBranchScope,
  scopeToBranchFilter,
} from './payroll-branch-scope';

function prismaWith(
  user: { mainBranch: number | null; roles: string[] } | null,
) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(
        user
          ? {
              mainBranch: user.mainBranch,
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

  it('confines a Branch Director to their own branch', async () => {
    const scope = await resolvePayrollBranchScope(
      prismaWith({ mainBranch: 2, roles: ['Branch Director'] }),
      10768,
    );
    expect(scope).toEqual({ kind: 'branch', branchId: 2 });
  });

  it('blocks a confined caller whose branch is unknown (fail closed)', async () => {
    const scope = await resolvePayrollBranchScope(
      prismaWith({ mainBranch: null, roles: ['Branch Director'] }),
      10768,
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

  describe('scopeToBranchFilter', () => {
    it('returns the branch for a confined scope', () => {
      expect(scopeToBranchFilter({ kind: 'branch', branchId: 2 })).toBe(2);
    });

    it('returns undefined for `all` — no filter is correct there', () => {
      expect(scopeToBranchFilter({ kind: 'all' })).toBeUndefined();
    });

    it('returns undefined for `none` — callers must check `kind` themselves', () => {
      // Deliberate: `none` must NOT silently look like "no filter". Every
      // caller pairs this with an explicit blocked/forbidden branch.
      expect(scopeToBranchFilter({ kind: 'none' })).toBeUndefined();
    });
  });
});
