import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Two single doors (ADR-0117). The reminder log is written only by
 * `eslatma-jurnali.ts`: a write elsewhere could send twice (no claim) or let
 * a FAILED row be retried. `remindersEnabled` is written only by
 * `eslatma-sozlama.ts`: a second writer could switch a student back on.
 * For the column the trigger is naming it at all — so every new reader is a
 * reviewed choice too, listed below with its reason.
 */
const SERVER = join(__dirname, '..', '..', '..');
const ROOTS = ['src', 'scripts'];
const JURNAL_YOZUVCHI = 'src/daf/eslatma/eslatma-jurnali.ts';
const PRISMA_WRITE =
  /\.dafReminderLog\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(/g;
// A nested write through the relation: `dafReminders: { create: … }`.
const NESTED_WRITE =
  /\bdafReminders\s*:\s*\{\s*(create|createMany|connectOrCreate|upsert|update|updateMany|delete|deleteMany|set|disconnect)\b/g;
const RAW_WRITE =
  /(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:"?public"?\.)?"DafReminderLog"/gi;
const USTUN = /\bremindersEnabled\b/;
const USTUN_ALLOWED: Record<string, string> = {
  'src/daf/eslatma/eslatma-sozlama.ts': 'the one writer',
  'src/daf/eslatma/eslatma-auditoriya.ts': 'reads it in the audience SQL',
  'src/daf/fortschritt/fortschritt.service.ts':
    'reads it in the `sozlama` CTE of `oquvchi-raqamlari`',
  'scripts/load/daf-yuklama-s4-paritet.ts':
    'reads it for the brute force (local load DB only)',
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

const files = ROOTS.flatMap((root) => walk(join(SERVER, root))).map((file) => ({
  path: file
    .slice(SERVER.length + 1)
    .split('\\')
    .join('/'),
  text: readFileSync(file, 'utf8'),
}));

const writers = files
  .filter(
    ({ text }) =>
      [...text.matchAll(PRISMA_WRITE)].length +
        [...text.matchAll(NESTED_WRITE)].length +
        [...text.matchAll(RAW_WRITE)].length >
      0,
  )
  .map(({ path }) => path);

describe('the reminder log and the reminders switch have one door each', () => {
  it('found the writers — a scan that matches nothing proves nothing', () => {
    expect(writers).toContain(JURNAL_YOZUVCHI);
    expect(
      files.some(
        ({ path, text }) =>
          path === 'src/daf/eslatma/eslatma-sozlama.ts' && USTUN.test(text),
      ),
    ).toBe(true);
  });

  it('the patterns see Prisma, nested and raw writes', () => {
    expect([
      ...'tx.dafReminderLog\n  .createManyAndReturn({})'.matchAll(PRISMA_WRITE),
    ]).toHaveLength(1);
    expect([
      ...'data: { dafReminders: { create: {} } }'.matchAll(NESTED_WRITE),
    ]).toHaveLength(1);
    expect([...'UPDATE "DafReminderLog" SET'.matchAll(RAW_WRITE)]).toHaveLength(
      1,
    );
    expect([
      ...'truncate table "DafReminderLog"'.matchAll(RAW_WRITE),
    ]).toHaveLength(1);
    expect([
      ...'delete from public."DafReminderLog"'.matchAll(RAW_WRITE),
    ]).toHaveLength(1);
    expect([
      ...'prisma.dafReminderLog.findMany({})'.matchAll(PRISMA_WRITE),
    ]).toHaveLength(0);
    expect([
      ...'ON CONFLICT ("studentId", "kind", "sentOn") DO NOTHING'.matchAll(
        RAW_WRITE,
      ),
    ]).toHaveLength(0);
  });

  it('no other file writes the reminder log', () => {
    expect(writers.filter((p) => p !== JURNAL_YOZUVCHI)).toEqual([]);
  });

  it('only the listed files name remindersEnabled', () => {
    expect(
      files
        .filter(({ text }) => USTUN.test(text))
        .map(({ path }) => path)
        .filter((p) => !(p in USTUN_ALLOWED)),
    ).toEqual([]);
  });
});
