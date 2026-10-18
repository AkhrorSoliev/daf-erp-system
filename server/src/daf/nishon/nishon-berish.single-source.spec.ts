import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * DafStudentBadge has one door: `grantBadges` (ADR-0115). A write anywhere
 * else could give a badge twice, or — worse — take one back, which the
 * design forbids. The one-time backfill goes through `grantBadges` too.
 */
const SERVER = join(__dirname, '..', '..', '..');
const ROOTS = ['src', 'scripts'];
const PRISMA_WRITE =
  /\.dafStudentBadge\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
// A nested write through the Student relation: `dafBadges: { create: … }`.
const NESTED_WRITE =
  /\bdafBadges\s*:\s*\{\s*(create|createMany|connectOrCreate|upsert|update|updateMany|delete|deleteMany|set|disconnect)\b/g;
const RAW_WRITE =
  /(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:"?public"?\.)?"DafStudentBadge"/gi;
const WRITER = 'src/daf/nishon/nishon-berish.ts';

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

const writers = ROOTS.flatMap((root) => walk(join(SERVER, root))).flatMap(
  (file) => {
    const path = file
      .slice(SERVER.length + 1)
      .split('\\')
      .join('/');
    const text = readFileSync(file, 'utf8');
    const n =
      [...text.matchAll(PRISMA_WRITE)].length +
      [...text.matchAll(NESTED_WRITE)].length +
      [...text.matchAll(RAW_WRITE)].length;
    return n > 0 ? [path] : [];
  },
);

describe('DafStudentBadge is written only by grantBadges', () => {
  it('found the writer — a scan that matches nothing proves nothing', () => {
    expect(writers).toContain(WRITER);
  });

  it('the patterns see Prisma, nested and raw writes', () => {
    expect([
      ...'tx.dafStudentBadge\n  .deleteMany({})'.matchAll(PRISMA_WRITE),
    ]).toHaveLength(1);
    expect([
      ...'data: { dafBadges: { create: {} } }'.matchAll(NESTED_WRITE),
    ]).toHaveLength(1);
    expect([
      ...'UPDATE "DafStudentBadge" SET'.matchAll(RAW_WRITE),
    ]).toHaveLength(1);
    expect([
      ...'delete from public."DafStudentBadge"'.matchAll(RAW_WRITE),
    ]).toHaveLength(1);
    expect([
      ...'prisma.dafStudentBadge.findMany({})'.matchAll(PRISMA_WRITE),
    ]).toHaveLength(0);
    expect([
      ...'select: { dafBadges: { select: {} } }'.matchAll(NESTED_WRITE),
    ]).toHaveLength(0);
  });

  it('no other file writes the table', () => {
    expect(writers.filter((p) => p !== WRITER)).toEqual([]);
  });
});
