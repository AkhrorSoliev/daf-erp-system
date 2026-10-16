import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * KPI results have one door: `KpiResultsService` (ADR-0094, spec §7.5). A
 * result is sealed when written and cancelled only with a reason; a write
 * from another module would skip the eligibility rule, the switch and the
 * one-active-result guard. The backfill script calls the service too.
 *
 * The scan reads whole files (a call may break across lines), accepts any
 * receiver name, and covers `src/` and `scripts/`.
 */

const SERVER = join(__dirname, '..', '..');
const ROOTS = ['src', 'scripts'];
const OWNER = 'src/kpi/kpi-results.service.ts';
const WRITE =
  /\.kpiResult\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

const writes = ROOTS.flatMap((root) => walk(join(SERVER, root))).flatMap(
  (file) =>
    [...readFileSync(file, 'utf8').matchAll(WRITE)].map((m) => ({
      path: file
        .slice(SERVER.length + 1)
        .split('\\')
        .join('/'),
      call: m[0].replace(/\s+/g, ' '),
    })),
);

describe('KPI results are written only by KpiResultsService', () => {
  it('found the writes — a scan that matches nothing proves nothing', () => {
    expect(writes.some((w) => w.path === OWNER)).toBe(true);
  });

  it('the pattern sees a call split over lines, under any receiver name', () => {
    const sample = 'await client\n  .kpiResult\n  .updateMany\n  (';
    expect([...sample.matchAll(WRITE)]).toHaveLength(1);
    expect([...'tx.kpiResult.findMany({})'.matchAll(WRITE)]).toHaveLength(0);
  });

  it('no other file writes a KpiResult row', () => {
    expect(
      writes.filter((w) => w.path !== OWNER).map((w) => `${w.path}: ${w.call}`),
    ).toEqual([]);
  });
});
