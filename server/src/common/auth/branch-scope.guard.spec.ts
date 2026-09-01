import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { BranchScopeGuard, BRANCH_SCOPE_KEY } from './branch-scope.guard';

/**
 * The guard is the single point where "which branch is this request about?" is
 * answered. Every test here is a leak that was reachable before it existed:
 * a scoped caller naming someone else's branch, a caller with no branch reading
 * as "everything", a typo'd header widening a one-branch view.
 */
describe('BranchScopeGuard', () => {
  const CEO = { roles: [{ role: { name: 'CEO' } }] };
  const staff = (name: string) => ({ roles: [{ role: { name } }] });

  function makeGuard(caller: any) {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(caller) },
    } as any;
    return { guard: new BranchScopeGuard(prisma), prisma };
  }

  function ctx(req: any): ExecutionContext {
    return {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
  }

  async function scopeFor(caller: any, req: any) {
    const { guard } = makeGuard(caller);
    const request = { user: { id: 1 }, headers: {}, query: {}, ...req };
    await guard.canActivate(ctx(request));
    return request[BRANCH_SCOPE_KEY];
  }

  describe('CEO — no ceiling', () => {
    it('resolves to null (every branch) when no branch is picked', async () => {
      expect(
        await scopeFor({ ...CEO, mainBranch: null, branches: [] }, {}),
      ).toBeNull();
    });

    it('narrows to the picked branch', async () => {
      const scope = await scopeFor(
        { ...CEO, mainBranch: null, branches: [] },
        { headers: { 'x-branch-id': '2' } },
      );
      expect(scope).toEqual([2]);
    });

    it("treats 'all' as no pick, not as a branch", async () => {
      const scope = await scopeFor(
        { ...CEO, mainBranch: null, branches: [] },
        { headers: { 'x-branch-id': 'all' } },
      );
      expect(scope).toBeNull();
    });
  });

  describe('scoped caller — ceiling applies', () => {
    const namanganDirector = {
      ...staff('Branch Director'),
      mainBranch: 2,
      branches: [{ branchId: 2 }],
    };

    it('returns their own branches when nothing is picked', async () => {
      expect(await scopeFor(namanganDirector, {})).toEqual([2]);
    });

    it('honours a pick INSIDE the ceiling', async () => {
      const scope = await scopeFor(namanganDirector, {
        headers: { 'x-branch-id': '2' },
      });
      expect(scope).toEqual([2]);
    });

    it('returns EMPTY — not their own scope — for a branch outside the ceiling', async () => {
      // The leak this guard exists to close: asking for Fargona as a Namangan
      // director must yield nothing, never a silent fallback to branch 2 under
      // a UI header naming branch 1.
      const scope = await scopeFor(namanganDirector, {
        headers: { 'x-branch-id': '1' },
      });
      expect(scope).toEqual([]);
    });

    it('reads the same value from ?branch_id= as from the header', async () => {
      const scope = await scopeFor(namanganDirector, {
        query: { branch_id: '1' },
      });
      expect(scope).toEqual([]);
    });

    it('prefers the QUERY parameter over the header', async () => {
      // The header is ambient — the client attaches the branch switcher's
      // selection to every request. A query parameter is one page naming one
      // branch for one request, so it is the more specific signal and wins.
      //
      // Reading the header first made the report pages' own branch dropdown
      // decorative: with the switcher on one branch, picking another on
      // /reports/departed-students still rendered the switcher's branch under a
      // control naming the one that was picked.
      //
      // This is also the STRICTER order. Here the query names a branch outside
      // the director's ceiling, so it resolves to nothing rather than quietly
      // serving branch 2 — the same "refuse rather than default" rule the rest
      // of this guard follows.
      const scope = await scopeFor(namanganDirector, {
        headers: { 'x-branch-id': '2' },
        query: { branch_id: '1' },
      });
      expect(scope).toEqual([]);
    });

    it('falls back to the header when the query names no branch', async () => {
      const scope = await scopeFor(namanganDirector, {
        headers: { 'x-branch-id': '2' },
        query: { page: '1' },
      });
      expect(scope).toEqual([2]);
    });

    it('a query parameter can NARROW but never WIDEN the ceiling', async () => {
      // The whole point: whatever is read is only a request. A director naming
      // a branch they may not see gets nothing, not that branch.
      expect(
        await scopeFor(namanganDirector, { query: { branchId: '1' } }),
      ).toEqual([]);
      expect(
        await scopeFor(namanganDirector, { query: { branchId: '2' } }),
      ).toEqual([2]);
    });

    it('merges mainBranch and UserBranch', async () => {
      const scope = await scopeFor(
        {
          ...staff('Administrator'),
          mainBranch: 1,
          branches: [{ branchId: 2 }],
        },
        {},
      );
      expect(new Set(scope as number[])).toEqual(new Set([1, 2]));
    });
  });

  describe('fail-closed', () => {
    it('gives a branch-less non-CEO NOTHING, never everything', async () => {
      const scope = await scopeFor(
        { ...staff('Administrator'), mainBranch: null, branches: [] },
        {},
      );
      expect(scope).toEqual([]);
    });

    it('rejects a malformed branch id instead of widening to the whole ceiling', async () => {
      const { guard } = makeGuard({ ...CEO, mainBranch: null, branches: [] });
      await expect(
        guard.canActivate(
          ctx({
            user: { id: 1 },
            headers: { 'x-branch-id': 'oops' },
            query: {},
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('pass-through cases', () => {
    it('leaves the scope unset for an unauthenticated (@Public) request', async () => {
      const { guard, prisma } = makeGuard(null);
      const req: any = { headers: {}, query: {} };
      await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
      expect(req[BRANCH_SCOPE_KEY]).toBeUndefined();
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('never blocks a request — it only annotates it', async () => {
      const { guard } = makeGuard({
        ...staff('Administrator'),
        mainBranch: null,
        branches: [],
      });
      const req: any = { user: { id: 1 }, headers: {}, query: {} };
      await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    });
  });
});
