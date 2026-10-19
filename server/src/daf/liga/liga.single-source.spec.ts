import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * The league tables have two doors (ADR-0116): `liga-xona.ts` (a room and a
 * membership, at a session's end) and `liga-hisob.ts` (the week's results,
 * tiers, next week's rooms and the group week). A write anywhere else could
 * lower a tier, put a student in two rooms or settle a week twice. A seed
 * that needs another write is named here, with the table it may write.
 */
const SERVER = join(__dirname, '..', '..', '..');
const ROOTS = ['src', 'scripts'];
const MODEL: Record<string, string> = {
  dafStudentLeague: 'DafStudentLeague',
  dafLeagueRoom: 'DafLeagueRoom',
  dafLeagueEntry: 'DafLeagueEntry',
  dafGroupWeek: 'DafGroupWeek',
  dafLeague: 'DafStudentLeague',
  dafLeagueEntries: 'DafLeagueEntry',
  leagueEntries: 'DafLeagueEntry',
  dafWeeks: 'DafGroupWeek',
};
const PRISMA_WRITE =
  /\.(dafStudentLeague|dafLeagueRoom|dafLeagueEntry|dafGroupWeek)\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(/g;
// A nested write through a relation: `dafLeagueEntries: { create: … }`.
const NESTED_WRITE =
  /\b(dafLeague|dafLeagueEntries|leagueEntries|dafWeeks)\s*:\s*\{\s*(create|createMany|connectOrCreate|upsert|update|updateMany|delete|deleteMany|set|disconnect)\b/g;
const RAW_WRITE =
  /(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:"?public"?\.)?"(DafStudentLeague|DafLeagueRoom|DafLeagueEntry|DafGroupWeek)"/gi;

const ALLOWED: Record<string, string[]> = {
  'src/daf/liga/liga-xona.ts': ['DafLeagueRoom', 'DafLeagueEntry'],
  'src/daf/liga/liga-hisob.ts': [
    'DafLeagueRoom',
    'DafLeagueEntry',
    'DafStudentLeague',
    'DafGroupWeek',
  ],
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
        table: MODEL[m[1]],
      })),
      ...[...text.matchAll(NESTED_WRITE)].map((m) => ({
        path,
        table: MODEL[m[1]],
      })),
      ...[...text.matchAll(RAW_WRITE)].map((m) => ({ path, table: m[2] })),
    ];
  },
);

describe('the league tables are written only in daf/liga', () => {
  it('found both writers — a scan that matches nothing proves nothing', () => {
    expect(writes.some((w) => w.path === 'src/daf/liga/liga-xona.ts')).toBe(
      true,
    );
    expect(writes.some((w) => w.path === 'src/daf/liga/liga-hisob.ts')).toBe(
      true,
    );
  });

  it('the patterns see Prisma, nested and raw writes', () => {
    expect([
      ...'tx.dafLeagueEntry\n  .deleteMany({})'.matchAll(PRISMA_WRITE),
    ]).toHaveLength(1);
    expect([
      ...'data: { dafLeagueEntries: { create: {} } }'.matchAll(NESTED_WRITE),
    ]).toHaveLength(1);
    expect([
      ...'UPDATE "DafStudentLeague" SET'.matchAll(RAW_WRITE),
    ]).toHaveLength(1);
    expect([
      ...'delete from public."DafGroupWeek"'.matchAll(RAW_WRITE),
    ]).toHaveLength(1);
    expect([
      ...'ON CONFLICT DO UPDATE SET tier = 1'.matchAll(RAW_WRITE),
    ]).toHaveLength(0);
    expect([
      ...'tx.dafLeagueEntry.createManyAndReturn({})'.matchAll(PRISMA_WRITE),
    ]).toHaveLength(1);
    expect([
      ...'tx.dafStudentLeague\n  .updateManyAndReturn({})'.matchAll(
        PRISMA_WRITE,
      ),
    ]).toHaveLength(1);
    expect([
      ...'prisma.dafLeagueRoom.findMany({})'.matchAll(PRISMA_WRITE),
    ]).toHaveLength(0);
  });

  it('no other file writes them', () => {
    expect(
      writes
        .filter((w) => !(ALLOWED[w.path] ?? []).includes(w.table))
        .map((w) => `${w.path}: ${w.table}`),
    ).toEqual([]);
  });
});
