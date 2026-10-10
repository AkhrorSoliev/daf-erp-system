/**
 * Writes what every route admits TODAY, before `@Roles` is replaced by
 * capability markers (spec 2026-10-05 §7.6). Run it once, on the commit
 * before the conversion; `permission-routes.spec.ts` compares against the
 * file it writes from then on.
 *
 *   npx ts-node --transpile-only scripts/route-access-snapshot.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { accessSummary } from '../src/common/permissions/route-access';
import { discoverRoutes } from './route-inventory';

// The server package root, as `branch-route-policy.spec.ts` uses it.
const serverRoot = join(__dirname, '..');
const routes = discoverRoutes(join(serverRoot, 'src'), serverRoot);
const snapshot: Record<string, unknown> = {};
for (const route of routes) snapshot[route.key] = accessSummary(route.access);

writeFileSync(
  join(
    serverRoot,
    'src',
    'common',
    'permissions',
    'route-access.snapshot.json',
  ),
  JSON.stringify(snapshot, null, 2) + '\n',
);
console.log(`${routes.length} routes written`);
