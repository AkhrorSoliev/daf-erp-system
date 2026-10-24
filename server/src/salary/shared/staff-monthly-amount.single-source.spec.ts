import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// ADR-0112: a staff member's monthly pay has one rule. `prorateFixedMonthly` is
// the formula and `resolveStaffMonthly` is the only thing that may call it, so
// a third copy of "what is this person owed for the month" cannot appear.
const SRC = join(__dirname, '..', '..');
const ALLOWED = new Set([
  'salary/shared/prorate-fixed-monthly.ts',
  'salary/shared/staff-monthly-amount.ts',
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('staff monthly pay has one rule', () => {
  it('only the resolver calls prorateFixedMonthly', () => {
    const offenders = walk(SRC)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .map((f) => relative(SRC, f).split('\\').join('/'))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) =>
        /\bprorateFixedMonthly\s*\(/.test(readFileSync(join(SRC, f), 'utf8')),
      );
    expect(offenders).toEqual([]);
  });
});
