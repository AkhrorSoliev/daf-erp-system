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
 * A route still on `@Roles` (or with no marker) is compared with the
 * snapshot as is: its intentional change applies once it is converted.
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

const LEGACY = new Set(['roles', 'none']);

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
    const expected =
      change && !LEGACY.has(route.access.kind)
        ? applyChange(before[key], change)
        : before[key];
    expect(accessSummary(route.access)).toEqual(expected);
  });
});
