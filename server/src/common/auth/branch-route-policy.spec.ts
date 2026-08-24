import { join } from 'path';
import { discoverRoutes } from '../../../scripts/route-inventory';
import {
  ROUTE_POLICIES,
  UNREVIEWED_BUDGET,
  UNREVIEWED_ROUTES,
} from './branch-route-policy';

/**
 * The gap between "the call forgot the scope" and "the route never made the
 * call".
 *
 * The first is a compile error: `ReportBranchIds` is a required parameter. The
 * second builds clean — a controller that queries Prisma directly, or stops at a
 * company-scoped helper, is indistinguishable to the type system from one that
 * is correctly confined, and it serves every branch.
 *
 * So the routes are discovered from the source and compared against the
 * manifest. A new endpoint fails here until somebody says which policy it is.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..');
const SRC = join(REPO_ROOT, 'src');

const routes = discoverRoutes(SRC, REPO_ROOT);
const byKey = new Map(routes.map((r) => [r.key, r]));

/** Header-scoped routes are evidenced by `@BranchScope()`, not declared. */
const headerScoped = routes.filter((r) => r.hasBranchScope).map((r) => r.key);
const declared = [
  ...ROUTE_POLICIES.flatMap((b) => b.routes),
  ...UNREVIEWED_ROUTES,
];

describe('branch route policy manifest', () => {
  it('discovers routes at all (a silent zero would report perfect coverage)', () => {
    // The failure this guards against is the worst one available: a broken
    // scanner finds nothing, every assertion below passes vacuously, and the
    // manifest reports full coverage of an empty set.
    expect(routes.length).toBeGreaterThan(300);
    expect(headerScoped.length).toBeGreaterThan(50);
  });

  it('classifies every route exactly once', () => {
    const seen = new Set<string>();
    const duplicated: string[] = [];
    for (const key of declared) {
      if (seen.has(key)) duplicated.push(key);
      seen.add(key);
    }
    expect(duplicated).toEqual([]);

    const covered = new Set([...declared, ...headerScoped]);
    const missing = routes.map((r) => r.key).filter((k) => !covered.has(k));

    expect(missing).toEqual([]);
  });

  it('names no route that does not exist', () => {
    // Deleting an endpoint without updating the manifest leaves a claim about
    // nothing, and the next reader counts it as covered.
    const ghosts = declared.filter((k) => !byKey.has(k));
    expect(ghosts).toEqual([]);
  });

  it('does not re-declare a route the source already evidences', () => {
    // A handler taking `@BranchScope()` IS header-scoped. Listing it again in
    // the manifest adds a second, weaker claim about a settled fact — and the
    // two can then disagree.
    const redundant = declared.filter((k) => byKey.get(k)?.hasBranchScope);
    expect(redundant).toEqual([]);
  });

  it('gives every block a reason a human wrote', () => {
    for (const block of ROUTE_POLICIES) {
      expect(block.routes.length).toBeGreaterThan(0);
      // Long enough to be an argument rather than a label. "company data" is
      // not a reason; it is the policy name restated.
      expect(block.reason.length).toBeGreaterThan(80);
    }
  });

  it('marks every TRUSTED_GATEWAY and PUBLIC route @Public() in the source', () => {
    // These two policies are claims about reachability WITHOUT a session. If the
    // source does not actually make the route public, the claim is false and the
    // reasoning that follows from it ("no human caller, so no scope") is too.
    const openBlocks = ROUTE_POLICIES.filter(
      (b) => b.policy === 'TRUSTED_GATEWAY' || b.policy === 'PUBLIC',
    );
    const mismatched = openBlocks
      .flatMap((b) => b.routes)
      .filter((k) => !byKey.get(k)?.isPublic);

    expect(mismatched).toEqual([]);
  });

  it('does not claim a guarded route is PUBLIC by omission', () => {
    // The reverse direction: every `@Public()` route must be declared as one of
    // the two open policies. A public endpoint quietly sitting in COMPANY_WIDE
    // or UNREVIEWED reads as "someone considered its branch scope", when in fact
    // nobody has to be signed in to call it.
    const openDeclared = new Set(
      ROUTE_POLICIES.filter(
        (b) => b.policy === 'TRUSTED_GATEWAY' || b.policy === 'PUBLIC',
      ).flatMap((b) => b.routes),
    );
    const undeclaredPublic = routes
      .filter((r) => r.isPublic && !r.hasBranchScope)
      .map((r) => r.key)
      .filter((k) => !openDeclared.has(k));

    expect(undeclaredPublic).toEqual([]);
  });

  it('keeps the UNREVIEWED backlog from growing', () => {
    // The whole point of admitting a backlog. A new endpoint cannot be parked
    // here, because the budget is a fixed number — so it must be classified when
    // it is written, which is the only moment anyone knows what it does.
    //
    // Lowering the budget is ordinary work: move routes into a policy block and
    // set UNREVIEWED_BUDGET to the new length.
    expect(UNREVIEWED_ROUTES.length).toBeLessThanOrEqual(UNREVIEWED_BUDGET);
  });

  it('has no route in UNREVIEWED that is already evidenced as scoped', () => {
    const wrongly = UNREVIEWED_ROUTES.filter(
      (k) => byKey.get(k)?.hasBranchScope,
    );
    expect(wrongly).toEqual([]);
  });
});
