import {
  assertCallerInBranch,
  resolveCallerBranchScope,
} from './branch-scope';

function prismaWith(
  user: { mainBranch: number | null; branchIds: number[]; roles: string[] } | null,
) {
  return {
    user: {
      findFirst: jest.fn().mockResolvedValue(
        user
          ? {
              mainBranch: user.mainBranch,
              branches: user.branchIds.map((branchId) => ({ branchId })),
              roles: user.roles.map((name) => ({ role: { name } })),
            }
          : null,
      ),
    },
  } as any;
}

/**
 * A `@Roles()` guard proves the caller HAS a role, not that the record they
 * addressed by id is theirs. These helpers are the object-level half.
 */
describe('resolveCallerBranchScope', () => {
  it('gives a CEO every branch even though they have none attached', async () => {
    const scope = await resolveCallerBranchScope(
      prismaWith({ mainBranch: null, branchIds: [], roles: ['CEO'] }),
      10000,
    );
    expect(scope).toEqual({ kind: 'all' });
  });

  it('merges mainBranch and UserBranch rows', async () => {
    // Different parts of the system historically wrote one or the other.
    const scope = await resolveCallerBranchScope(
      prismaWith({ mainBranch: 2, branchIds: [1], roles: ['Administrator'] }),
      10737,
    );
    expect(scope.kind).toBe('branches');
    expect((scope as any).branchIds.sort()).toEqual([1, 2]);
  });

  it('gives a branch-less non-CEO NOTHING, not everything', async () => {
    const scope = await resolveCallerBranchScope(
      prismaWith({ mainBranch: null, branchIds: [], roles: ['Administrator'] }),
      10737,
    );
    expect(scope).toEqual({ kind: 'branches', branchIds: [] });
  });

  it('refuses an unidentifiable caller', async () => {
    await expect(
      resolveCallerBranchScope(prismaWith(null), undefined),
    ).rejects.toThrow(/aniqlanmadi/);
    await expect(
      resolveCallerBranchScope(prismaWith(null), 99999),
    ).rejects.toThrow(/topilmadi/);
  });
});

describe('assertCallerInBranch', () => {
  const director = { mainBranch: 1, branchIds: [1], roles: ['Branch Director'] };

  it('passes for the caller’s own branch', async () => {
    await expect(
      assertCallerInBranch(prismaWith(director), 10768, 1),
    ).resolves.toBeUndefined();
  });

  it('throws for another branch', async () => {
    await expect(
      assertCallerInBranch(prismaWith(director), 10768, 2),
    ).rejects.toThrow(/ruxsat yo'q/);
  });

  it('never blocks a CEO', async () => {
    await expect(
      assertCallerInBranch(
        prismaWith({ mainBranch: null, branchIds: [], roles: ['CEO'] }),
        10000,
        2,
      ),
    ).resolves.toBeUndefined();
  });

  it('throws for a branch-less non-CEO (fail closed)', async () => {
    await expect(
      assertCallerInBranch(
        prismaWith({ mainBranch: null, branchIds: [], roles: ['Cashier'] }),
        10500,
        1,
      ),
    ).rejects.toThrow(/ruxsat yo'q/);
  });

  it('carries a caller-supplied message', async () => {
    await expect(
      assertCallerInBranch(prismaWith(director), 10768, 2, 'Maxsus xabar'),
    ).rejects.toThrow('Maxsus xabar');
  });
});

/**
 * An Administrator normally works in one branch, but the centre can attach
 * several — and then they must act in each exactly like a local admin. That is
 * why the scope is a SET rather than a single `mainBranch`: confining to
 * `mainBranch` alone would silently lock a multi-branch admin out of every
 * branch but one.
 */
describe('multi-branch staff', () => {
  const multiAdmin = {
    mainBranch: 1,
    branchIds: [1, 2],
    roles: ['Administrator'],
  };

  it('may act in EVERY attached branch, not just mainBranch', async () => {
    await expect(
      assertCallerInBranch(prismaWith(multiAdmin), 10737, 1),
    ).resolves.toBeUndefined();
    await expect(
      assertCallerInBranch(prismaWith(multiAdmin), 10737, 2),
    ).resolves.toBeUndefined();
  });

  it('is still refused a branch nobody attached', async () => {
    await expect(
      assertCallerInBranch(prismaWith(multiAdmin), 10737, 3),
    ).rejects.toThrow(/ruxsat yo'q/);
  });
});

