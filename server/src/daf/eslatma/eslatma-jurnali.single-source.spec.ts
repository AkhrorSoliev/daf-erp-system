import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Two single doors (ADR-0117). The reminder log is written only by
 * `eslatma-jurnali.ts`: a write elsewhere could send twice (no claim) or let
 * a FAILED row be retried. `DafStudentSetting.remindersEnabled` is written
 * only by `eslatma-sozlama.ts`: a second writer could switch a student back
 * on. The column rule looks at WRITES that name the column (a Prisma call on
 * `dafStudentSetting`, a nested `dafSetting: { … }` write, a raw INSERT or
 * UPDATE of the table), comments stripped. Readers (SELECT lists, `where`,
 * comments) and writes of other columns (`maqsad.ts` writes `dailyGoal`, the
 * load seeds) are not flagged. Known limit: a spread (`data: dto`) or a
 * dynamic key does not name the column and is not seen.
 */
const SERVER = join(__dirname, '..', '..', '..');
const ROOTS = ['src', 'scripts'];
const JURNAL_YOZUVCHI = 'src/daf/eslatma/eslatma-jurnali.ts';
const COLUMN_WRITER = 'src/daf/eslatma/eslatma-sozlama.ts';

const PRISMA_WRITE =
  /\.dafReminderLog\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(/g;
// A nested write through the relation: `dafReminders: { create: … }`.
const NESTED_WRITE =
  /\bdafReminders\s*:\s*\{\s*(create|createMany|connectOrCreate|upsert|update|updateMany|delete|deleteMany|set|disconnect)\b/g;
const RAW_WRITE =
  /(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:"?public"?\.)?"DafReminderLog"/gi;

const SETTING_CALL =
  /\.dafStudentSetting\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(/g;
// `Student.dafSetting` is the relation field (schema.prisma).
const SETTING_NESTED =
  /\bdafSetting\s*:\s*\{\s*(create|connectOrCreate|upsert|update|updateMany|set)\b/g;
const SETTING_RAW =
  /(INSERT\s+INTO|UPDATE)\s+(?:"?public"?\.)?"DafStudentSetting"/gi;
const COLUMN = /\bremindersEnabled\b/;

interface SourceFile {
  path: string;
  text: string;
}

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

const stripComments = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Text from the opening ( or { at `i` to its match.
function balanced(t: string, i: number): string {
  const open = t[i];
  const close = open === '(' ? ')' : '}';
  let depth = 0;
  for (let k = i; k < t.length; k++) {
    if (t[k] === open) depth++;
    else if (t[k] === close && --depth === 0) return t.slice(i, k + 1);
  }
  return t.slice(i);
}

function settingWrites(raw: string): string[] {
  const t = stripComments(raw);
  return [
    ...[...t.matchAll(SETTING_CALL)].map((m) =>
      balanced(t, m.index + m[0].length - 1),
    ),
    ...[...t.matchAll(SETTING_NESTED)].map((m) =>
      balanced(t, t.indexOf('{', m.index + m[0].indexOf(':'))),
    ),
    ...[...t.matchAll(SETTING_RAW)].map(
      (m) => t.slice(m.index).split(/[`;]/)[0],
    ),
  ];
}

/** Files that write `remindersEnabled`. */
const columnWriters = (files: SourceFile[]) =>
  files
    .filter(({ text }) => settingWrites(text).some((s) => COLUMN.test(s)))
    .map(({ path }) => path);

/** Files that write the reminder log. */
const logWriters = (files: SourceFile[]) =>
  files
    .filter(
      ({ text }) =>
        [...text.matchAll(PRISMA_WRITE)].length +
          [...text.matchAll(NESTED_WRITE)].length +
          [...text.matchAll(RAW_WRITE)].length >
        0,
    )
    .map(({ path }) => path);

const files: SourceFile[] = ROOTS.flatMap((root) =>
  walk(join(SERVER, root)),
).map((file) => ({
  path: file
    .slice(SERVER.length + 1)
    .split('\\')
    .join('/'),
  text: readFileSync(file, 'utf8'),
}));

describe('the reminder log and the reminders switch have one door each', () => {
  it('found the writers — a scan that matches nothing proves nothing', () => {
    expect(logWriters(files)).toContain(JURNAL_YOZUVCHI);
    expect(columnWriters(files)).toContain(COLUMN_WRITER);
  });

  it('the log patterns see Prisma, nested and raw writes', () => {
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

  it('the column rule sees writes and ignores reads, other columns and comments', () => {
    const w = (s: string) => columnWriters([{ path: 'x.ts', text: s }]).length;
    // writes
    expect(
      w('tx.dafStudentSetting.update({ data: { remindersEnabled: false } })'),
    ).toBe(1);
    expect(
      w(
        'p.dafStudentSetting\n .upsert({ create: { remindersEnabled: true }, update: {} })',
      ),
    ).toBe(1);
    expect(
      w(
        'x.dafStudentSetting.createManyAndReturn({ data: [{ remindersEnabled: true }] })',
      ),
    ).toBe(1);
    expect(
      w(
        's.update({ data: { dafSetting: { upsert: { create: { remindersEnabled: false }, update: {} } } } })',
      ),
    ).toBe(1);
    expect(
      w(
        'p.$executeRaw`UPDATE "DafStudentSetting" SET "remindersEnabled" = true`',
      ),
    ).toBe(1);
    expect(
      w(
        'p.$executeRaw`INSERT INTO "DafStudentSetting" ("studentId","remindersEnabled") VALUES (1,false)`',
      ),
    ).toBe(1);
    // reads / other column / comments
    expect(
      w(
        'p.dafStudentSetting.findMany({ select: { remindersEnabled: true, dailyGoal: true } })',
      ),
    ).toBe(0);
    expect(
      w(
        'p.$queryRaw`SELECT COALESCE(st."remindersEnabled", true) AS e FROM "DafStudentSetting" st WHERE COALESCE(st."remindersEnabled", true)`',
      ),
    ).toBe(0);
    expect(
      w(
        'p.dafStudentSetting.upsert({ where: { studentId }, create: { studentId, companyId, dailyGoal: d }, update: { dailyGoal: d } })',
      ),
    ).toBe(0);
    expect(
      w(
        'p.$executeRaw`INSERT INTO "DafStudentSetting" ("studentId","companyId","dailyGoal","updatedAt") SELECT 1,1,\'ORTA\',now()`',
      ),
    ).toBe(0);
    expect(
      w("/** `DafStudentSetting.remindersEnabled`, qator yo'q = true */"),
    ).toBe(0);
    expect(
      w(
        '// prisma.dafStudentSetting.update({ data: { remindersEnabled: false } })',
      ),
    ).toBe(0);
  });

  it('a bad file fails each rule, an allowed file passes (the scan is not vacuous)', () => {
    const bad: SourceFile = {
      path: 'src/daf/fortschritt/fortschritt.service.ts',
      text: 'await prisma.dafStudentSetting.update({ where: { studentId }, data: { remindersEnabled: true } });\nawait prisma.dafReminderLog.deleteMany({});',
    };
    const reader: SourceFile = {
      path: 'src/daf/eslatma/eslatma-auditoriya.ts',
      text: 'const q = Prisma.sql`SELECT COALESCE(st."remindersEnabled", true) FROM "DafStudentSetting" st`;',
    };
    const door: SourceFile = {
      path: COLUMN_WRITER,
      text: 'await prisma.dafStudentSetting.upsert({ where, create: { remindersEnabled: y }, update: { remindersEnabled: y } });',
    };
    expect(columnWriters([bad, reader, door])).toEqual([bad.path, door.path]);
    expect(
      columnWriters([bad, reader, door]).filter((p) => p !== COLUMN_WRITER),
    ).toEqual([bad.path]);
    expect(logWriters([bad, reader])).toEqual([bad.path]);
  });

  it('no other file writes the reminder log', () => {
    expect(logWriters(files).filter((p) => p !== JURNAL_YOZUVCHI)).toEqual([]);
  });

  it('only eslatma-sozlama.ts writes remindersEnabled', () => {
    expect(columnWriters(files).filter((p) => p !== COLUMN_WRITER)).toEqual([]);
  });
});
