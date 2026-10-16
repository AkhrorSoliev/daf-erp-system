import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * KPI results have one door: `KpiResultsService` (ADR-0094, spec §7.5). A
 * result is sealed when written and cancelled only with a reason; a write
 * from another module would skip the eligibility rule, the switch and the
 * one-active-result guard. The backfill script calls the service too.
 */

const SRC = join(__dirname, '..');
const OWNER = 'src/kpi/kpi-results.service.ts';
const WRITE =
  /\b(tx|prisma|db|this\.prisma)\.kpiResult\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g;

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

const writes = walk(SRC).flatMap((file) => {
  const path =
    'src/' +
    file
      .slice(SRC.length + 1)
      .split('\\')
      .join('/');
  return [...readFileSync(file, 'utf8').matchAll(WRITE)].map((m) => ({
    path,
    call: m[0],
  }));
});

describe('KPI results are written only by KpiResultsService', () => {
  it('found the writes — a scan that matches nothing proves nothing', () => {
    expect(writes.some((w) => w.path === OWNER)).toBe(true);
  });

  it('no other file writes a KpiResult row', () => {
    expect(
      writes.filter((w) => w.path !== OWNER).map((w) => `${w.path}: ${w.call}`),
    ).toEqual([]);
  });
});
