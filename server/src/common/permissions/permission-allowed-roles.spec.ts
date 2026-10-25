import { join } from 'path';
import { discoverRoutes } from '../../../scripts/route-inventory';
import { ROUTE_POLICIES, UNREVIEWED_ROUTES } from '../auth/branch-route-policy';
import {
  PERMISSION_KEYS,
  PermissionKey,
  permissionDef,
} from './permission-catalog';

/*
 * The CEO may give a role a capability beyond its defaults only where the
 * code already confines that role (spec §6, ADR-0087). The catalog spec checks
 * the data; this one checks the routes. A capability whose `allowedRoles` is
 * wider than its `defaultRoles` must not open:
 *   - an UNREVIEWED route (its branch boundary was never reasoned about), or
 *   - a COMPANY_WIDE write (it reaches every branch),
 * unless the write is reviewed below. Each reason starts with the route key
 * and a colon, and says why the route stays safe.
 */
const REVIEWED_COMPANY_WIDE_WRITES: Partial<Record<PermissionKey, string>> = {
  'settings.branches':
    'POST /branches: BranchesService.create refuses every caller but the CEO',
  'settings.tax':
    'PATCH /settings/tax: every tax key is companyLevelOnly; widened only so the CEO can hand the page to an accountant account',
};

const SERVER_ROOT = join(__dirname, '..', '..', '..');
const routes = discoverRoutes(join(SERVER_ROOT, 'src'), SERVER_ROOT);

const policyOf = new Map<string, string>();
for (const block of ROUTE_POLICIES) {
  for (const key of block.routes) policyOf.set(key, block.policy);
}
for (const key of UNREVIEWED_ROUTES) policyOf.set(key, 'UNREVIEWED');

const widened = PERMISSION_KEYS.filter((key) => {
  const def = permissionDef(key);
  return def.allowedRoles.some((role) => !def.defaultRoles.includes(role));
});

const routesOf = (key: PermissionKey) =>
  routes.filter((r) => r.access.kind === 'can' && r.access.keys.includes(key));

const companyWideWrites = (key: PermissionKey) =>
  routesOf(key).filter(
    (r) =>
      !r.hasBranchScope &&
      policyOf.get(r.key) === 'COMPANY_WIDE' &&
      r.method !== 'GET',
  );

describe('a widened capability opens only reviewed routes', () => {
  it('finds widened capabilities at all (an empty list would pass vacuously)', () => {
    expect(widened.length).toBeGreaterThan(30);
  });

  it.each(widened)('%s opens no UNREVIEWED route', (key) => {
    expect(
      routesOf(key)
        .filter((r) => policyOf.get(r.key) === 'UNREVIEWED')
        .map((r) => r.key),
    ).toEqual([]);
  });

  it.each(widened)('%s opens no unreviewed COMPANY_WIDE write', (key) => {
    const reason = REVIEWED_COMPANY_WIDE_WRITES[key];
    expect(
      companyWideWrites(key)
        .filter((r) => !reason?.startsWith(`${r.key}:`))
        .map((r) => r.key),
    ).toEqual([]);
  });

  it('reviews only widened capabilities and routes that exist', () => {
    for (const [key, reason] of Object.entries(REVIEWED_COMPANY_WIDE_WRITES)) {
      const capability = key as PermissionKey;
      expect({ key, widened: widened.includes(capability) }).toEqual({
        key,
        widened: true,
      });
      expect({
        key,
        named: companyWideWrites(capability).some((r) =>
          reason.startsWith(`${r.key}:`),
        ),
      }).toEqual({ key, named: true });
    }
  });
});
