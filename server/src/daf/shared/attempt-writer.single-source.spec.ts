import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * DafAttempt and DafStudentDay have one door: `recordAttempt` (ADR-0114).
 * A write anywhere else would leave the day totals behind the attempts, and
 * every ranking reads the totals. Scripts that rebuild or seed the table
 * write raw SQL and are named here on purpose.
 */
const SERVER = join(__dirname, '..', '..', '..');
const ROOTS = ['src', 'scripts'];
const PRISMA_WRITE =
  /\.(dafAttempt|dafStudentDay)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const RAW_WRITE =
  /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(DafAttempt|DafStudentDay)"/g;

const ALLOWED: Record<string, string[]> = {
  'src/daf/shared/attempt-writer.ts': ['DafAttempt', 'DafStudentDay'],
  'scripts/rebuild-daf-student-day.ts': ['DafStudentDay'],
  'scripts/lib/daf-student-day-sql.ts': ['DafStudentDay'],
  'scripts/load/daf-yuklama-seed.ts': ['DafAttempt', 'DafStudentDay'],
  // Local only: two 0-point rows inside a transaction that is always rolled back.
  'scripts/load/daf-yuklama-paritet.ts': ['DafStudentDay'],
};

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

const model = (name: string) =>
  name.startsWith('dafA') || name === 'DafAttempt'
    ? 'DafAttempt'
    : 'DafStudentDay';

const writes = ROOTS.flatMap((root) => walk(join(SERVER, root))).flatMap(
  (file) => {
    const path = file
      .slice(SERVER.length + 1)
      .split('\\')
      .join('/');
    const text = readFileSync(file, 'utf8');
    return [
      ...[...text.matchAll(PRISMA_WRITE)].map((m) => ({
        path,
        table: model(m[1]),
      })),
      ...[...text.matchAll(RAW_WRITE)].map((m) => ({
        path,
        table: model(m[2]),
      })),
    ];
  },
);

describe('DafAttempt / DafStudentDay are written only by recordAttempt', () => {
  it('found the writer — a scan that matches nothing proves nothing', () => {
    expect(
      writes.some((w) => w.path === 'src/daf/shared/attempt-writer.ts'),
    ).toBe(true);
  });

  it('the patterns see Prisma and raw writes', () => {
    expect([
      ...'tx\n  .dafAttempt\n  .create(\n'.matchAll(PRISMA_WRITE),
    ]).toHaveLength(1);
    expect([...'DELETE FROM "DafStudentDay"'.matchAll(RAW_WRITE)]).toHaveLength(
      1,
    );
    expect([
      ...'prisma.dafAttempt.findMany({})'.matchAll(PRISMA_WRITE),
    ]).toHaveLength(0);
  });

  it('no other file writes either table', () => {
    expect(
      writes
        .filter((w) => !(ALLOWED[w.path] ?? []).includes(w.table))
        .map((w) => `${w.path}: ${w.table}`),
    ).toEqual([]);
  });
});
