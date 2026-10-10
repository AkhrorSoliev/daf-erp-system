import { readFileSync } from 'fs';
import { join } from 'path';
import { discoverRoutes } from '../../../scripts/route-inventory';
import {
  AccessChange,
  INTENTIONAL_ACCESS_CHANGES,
} from './intentional-access-changes';
import { AccessSummary, accessSummary } from './route-access';

/*
 * Every route's default access must equal what it admitted on `main` before
 * the capability conversion (`route-access.snapshot.json`), except for the
 * reviewed, explained differences in `intentional-access-changes.ts`.
 *
 * The second block is the manifest: every route carries exactly one marker
 * (or `@Public()`), because `PermissionGuard` refuses one without.
 */
// The server package root, as `branch-route-policy.spec.ts` uses it.
const SERVER_ROOT = join(__dirname, '..', '..', '..');
const routes = discoverRoutes(join(SERVER_ROOT, 'src'), SERVER_ROOT);
const before = JSON.parse(
  readFileSync(join(__dirname, 'route-access.snapshot.json'), 'utf8'),
) as Record<string, AccessSummary>;

function applyChange(summary: AccessSummary, change: AccessChange): string[] {
  if (!Array.isArray(summary)) {
    throw new Error('Only a role list can change');
  }
  const out = new Set(summary);
  for (const role of change.remove ?? []) out.delete(role);
  for (const role of change.add ?? []) out.add(role);
  return [...out].sort();
}

describe('route access equals the snapshot taken before capabilities', () => {
  it('has a snapshot row for every route and no row for a route that is gone', () => {
    expect(Object.keys(before).sort()).toEqual(routes.map((r) => r.key).sort());
  });

  it('names only routes that exist in its intentional changes', () => {
    for (const key of Object.keys(INTENTIONAL_ACCESS_CHANGES)) {
      expect({ key, known: key in before }).toEqual({ key, known: true });
    }
  });

  it.each(routes.map((r) => [r.key, r] as const))('%s', (key, route) => {
    const change = INTENTIONAL_ACCESS_CHANGES[key];
    const expected = change ? applyChange(before[key], change) : before[key];
    expect(accessSummary(route.access)).toEqual(expected);
  });
});

describe('route manifest: every route declares exactly one access', () => {
  it('has a marker or @Public() on every route', () => {
    const unmarked = routes
      .filter((r) => r.access.kind === 'none')
      .map((r) => r.key);
    expect(unmarked).toEqual([]);
  });

  it('puts at most one marker on a handler and at most one on a controller', () => {
    const doubled = routes
      .filter(
        (r) =>
          r.accessMarkers.handler.length > 1 ||
          r.accessMarkers.controller.length > 1,
      )
      .map((r) => r.key);
    expect(doubled).toEqual([]);
  });

  it('names only catalog capabilities in @Can', () => {
    for (const route of routes) {
      if (route.access.kind !== 'can') continue;
      expect({ key: route.key, keys: route.access.keys.length }).not.toEqual({
        key: route.key,
        keys: 0,
      });
      expect(() => accessSummary(route.access)).not.toThrow();
    }
  });
});
