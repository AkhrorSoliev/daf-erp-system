import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * `gap-sweep.ts` says of itself: *"This is the one implementation of which
 * lessons qualify… Two copies of these four exclusions would drift, and the
 * drift would be a payroll figure disagreeing with the list of people it is
 * owed by."*
 *
 * That was not true. `SalaryCalculationService` — the cron that WRITES the
 * accruals — carried its own copy of the loop for months. Nothing detected it,
 * because a comment cannot enforce anything and both copies were individually
 * tested as correct. ADR-0006 rejected exactly that arrangement: *"testlar
 * formulalar bir xil ekanini emas, har biri o'zicha to'g'ri ekanini
 * tekshiradi. Chetlashish shundan chiqqan edi."*
 *
 * So this file enforces the claim instead of restating it. The marker is
 * `NEW_STUDENT_TOPUP_MIN_LESSONS`, the BR-09 gate: reaching for it inside
 * `src/salary` means reasoning about which lessons the centre has to front,
 * and that reasoning lives in one function.
 *
 * If this fails on a file you just wrote, the fix is to call
 * `sweepGapLessons` — not to add the file to the exemption list.
 */
describe('sweepGapLessons is the single source of gap-lesson rules', () => {
  const SALARY_DIR = join(__dirname, '..');
  const MARKER = 'NEW_STUDENT_TOPUP_MIN_LESSONS';

  /** Files allowed to name the marker without importing the sweep. */
  const EXEMPT = new Set([
    // Declares the constant.
    'shared/topup.ts',
    // Is the implementation.
    'shared/gap-sweep.ts',
  ]);

  function sourceFiles(dir: string, prefix = ''): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return sourceFiles(join(dir, entry.name), rel);
      if (!entry.name.endsWith('.ts')) return [];
      if (entry.name.endsWith('.spec.ts')) return [];
      return [rel];
    });
  }

  const files = sourceFiles(SALARY_DIR);

  it('finds the salary sources at all (guards against a silent empty sweep)', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain('shared/gap-sweep.ts');
    expect(files).toContain('salary-calculation.service.ts');
  });

  it.each(files)('%s does not reimplement the gap rules', (rel) => {
    const src = readFileSync(join(SALARY_DIR, rel), 'utf8');
    if (!src.includes(MARKER)) return;
    if (EXEMPT.has(rel)) return;

    expect(src).toContain('sweepGapLessons');
  });

  it('is enforced against the three surfaces that show or pay the figure', () => {
    // Named explicitly so deleting a call site is as visible as adding a copy:
    // the payroll cron pays it, `getMonthly` shows it per teacher, the top-up
    // drill-down shows it per student. All three must agree by construction.
    for (const rel of [
      'salary-calculation.service.ts',
      'salary-monthly.service.ts',
      'salary-center-topup.service.ts',
    ]) {
      expect(readFileSync(join(SALARY_DIR, rel), 'utf8')).toContain(
        'sweepGapLessons',
      );
    }
  });
});
