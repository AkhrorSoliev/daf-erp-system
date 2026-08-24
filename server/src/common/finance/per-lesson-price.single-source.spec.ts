import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Freezes the spread of the per-lesson divisor.
 *
 * `perLessonPrice()` is meant to be the one place that turns a course price
 * into one lesson's price, and for a while its own docstring claimed it was.
 * It never was: `course.lessonPaymentCount || 12` is written out by hand in a
 * dozen services, several of them on money paths (`billing/`, `salary/`).
 *
 * Consolidating them is a real change with real numbers behind it. Preventing
 * the THIRTEENTH is free, which is what this test does — the same shape as
 * `salary/shared/gap-sweep.single-source.spec.ts` and
 * `branch-route-policy.spec.ts`, both of which already hold in this codebase.
 *
 * If this test fails on a file you just wrote: import `perLessonPrice` instead.
 * If it fails on a file you just DELETED the divisor from, remove it from the
 * list below — the list is only ever allowed to get shorter.
 */

/** Every site that still owns a copy of the divisor. Shrink only. */
const GRANDFATHERED = [
  'src/attendance/attendance-read.service.ts',
  'src/billing/debt-write-off.service.spec.ts',
  'src/billing/debt-write-off.service.ts',
  'src/billing/enrollment-billing.service.ts',
  'src/billing/lesson-billing.service.ts',
  'src/payments/payments-preview.service.ts',
  'src/reports/reports-expectation.service.ts',
  'src/reports/reports-financial.service.ts',
  'src/salary/salary-accrual.service.ts',
  'src/salary/salary-calculation.service.ts',
  'src/salary/shared/gap-sweep.ts',
  'src/students/students-read.service.ts',
].sort();

/** `lessonPaymentCount || 12` / `?? 12`, in any spacing. */
const INLINE_DIVISOR = /lessonPaymentCount\s*(\|\||\?\?)\s*12/;

const SRC = join(__dirname, '..', '..');
const OWN_FILE = 'src/common/finance/per-lesson-price.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('per-lesson price — single source', () => {
  const offenders = walk(SRC)
    .filter((file) => INLINE_DIVISOR.test(readFileSync(file, 'utf8')))
    .map(
      (file) =>
        'src/' +
        file
          .slice(SRC.length + 1)
          .split('\\')
          .join('/'),
    )
    .filter((rel) => rel !== OWN_FILE && !rel.endsWith('single-source.spec.ts'))
    .sort();

  it('has not grown a new hand-written divisor', () => {
    const added = offenders.filter((f) => !GRANDFATHERED.includes(f));
    expect(added).toEqual([]);
  });

  it('keeps the grandfathered list honest — no stale entries', () => {
    const gone = GRANDFATHERED.filter((f) => !offenders.includes(f));
    expect(gone).toEqual([]);
  });

  it('still knows about every known site', () => {
    expect(offenders).toEqual(GRANDFATHERED);
  });
});
