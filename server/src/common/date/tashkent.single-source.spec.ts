import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Freezes the three ways a Tashkent day boundary gets rebuilt by hand.
 *
 * All three shipped to production at once. A Click payment at
 * 2026-08-05T19:18:44Z — 06.08 00:18 in Tashkent — appeared under the 05.08
 * filter of /reports/student-payments, and an 01:30 payment appeared under no
 * day at all, because the bounds were plain UTC midnight instead of 00:00
 * Tashkent. The same shape was copy-pasted into thirteen services.
 *
 * `common/date/tashkent.ts` owns this now. If this test fails on a file you
 * just wrote, import `tashkentRangeUtc` (TIMESTAMP columns) or
 * `utcMidnightFromDateStr` (`@db.Date` columns) instead of hand-rolling.
 *
 * The banned patterns, and why each is a money bug:
 */
const BANNED: { name: string; why: string; pattern: RegExp }[] = [
  {
    name: 'end-of-day via setHours',
    // `setHours` works in the PROCESS timezone, so the same source gave a
    // different window on a UTC host, a Tashkent host and a laptop.
    why: 'use tashkentRangeUtc(startStr, endStr) — setHours reads the process timezone',
    pattern: /\.setHours\(\s*23\s*,\s*59\s*,\s*59/,
  },
  {
    name: 'end-of-day via a literal UTC time suffix',
    why: "use tashkentRangeUtc — 'T23:59:59.999Z' is 04:59 the next morning in Tashkent",
    pattern: /T23:59:59(\.999)?Z/,
  },
  {
    name: 'range bound built straight from a date-string field',
    // new Date('2026-08-05') is 00:00 UTC = 05:00 Tashkent.
    why: 'use tashkentDayStartUtc(dateStr) — new Date(dateStr) is 00:00 UTC, not 00:00 Tashkent',
    pattern:
      /new Date\(\s*(params|query|filter|dto|input|opts|options)\.(start|end)Date\s*\)/,
  },
];

/**
 * Mixing a Tashkent-shifted instant with a plain-date bound in one filter.
 * `period.start` is 00:00 Tashkent (a real instant); `period.endDate` is UTC
 * midnight (a calendar date). A `@db.Date` column compared against the former
 * is truncated to the PREVIOUS UTC day — the same class of bug that once
 * inflated a month of teacher salary by 1 819 343 so'm. Pick one pair:
 * `{ start, endTs }` for TIMESTAMP, `{ startDate, endDate }` for `@db.Date`.
 */
const MIXED_PAIR =
  /gte:\s*(\w+)\.start\s*,\s*lte:\s*\1\.endDate|gte:\s*(\w+)\.startDate\s*,\s*lte:\s*\2\.endTs/;

const SRC = join(__dirname, '..', '..');
const OWN_DIR = join('src', 'common', 'date');

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

const files = walk(SRC).filter((f) => {
  const rel = relative(join(SRC, '..'), f);
  // The owning module is allowed to name the patterns. Specs are excluded
  // too: a test may legitimately write out a boundary it expects to see.
  return !rel.startsWith(OWN_DIR) && !rel.endsWith('.spec.ts');
});

describe('Tashkent day bounds — single source', () => {
  it.each(BANNED)('bans $name', ({ pattern, why }) => {
    const offenders = files
      .filter((f) => pattern.test(readFileSync(f, 'utf8')))
      .map((f) => relative(join(SRC, '..'), f))
      .sort();
    expect({ offenders, fix: why }).toEqual({ offenders: [], fix: why });
  });

  it('bans mixing a timestamp bound with a date-column bound in one filter', () => {
    const offenders = files
      .filter((f) => MIXED_PAIR.test(readFileSync(f, 'utf8')))
      .map((f) => relative(join(SRC, '..'), f))
      .sort();
    expect(offenders).toEqual([]);
  });
});
