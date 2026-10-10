/**
 * Writes what every route admits TODAY, before `@Roles` is replaced by
 * capability markers (spec 2026-10-05 §7.6). Run it once, on the commit
 * before the conversion; `permission-routes.spec.ts` compares against the
 * file it writes from then on.
 *
 *   npx ts-node --transpile-only scripts/route-access-snapshot.ts
 *
 * It refuses to overwrite an existing snapshot unless `--force` is passed:
 * re-running it after the conversion would fold the intentional changes
 * (`intentional-access-changes.ts`) into the baseline they are measured
 * against.
 */
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { accessSummary } from '../src/common/permissions/route-access';
import { discoverRoutes } from './route-inventory';

// The server package root, as `branch-route-policy.spec.ts` uses it.
const serverRoot = join(__dirname, '..');
const target = join(
  serverRoot,
  'src',
  'common',
  'permissions',
  'route-access.snapshot.json',
);

if (existsSync(target) && !process.argv.includes('--force')) {
  console.error(
    `${target} already exists. It is the baseline taken on main before the ` +
      'capability conversion; regenerating it now would fold the intentional ' +
      'access changes into it. A new route gets its row added by hand (and a ' +
      'changed default an entry in intentional-access-changes.ts). Pass ' +
      '--force only to regenerate it from a commit that still uses @Roles.',
  );
  process.exit(1);
}

const routes = discoverRoutes(join(serverRoot, 'src'), serverRoot);
const snapshot: Record<string, unknown> = {};
for (const route of routes) snapshot[route.key] = accessSummary(route.access);

writeFileSync(target, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`${routes.length} routes written`);
