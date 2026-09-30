/**
 * Command line of `scripts/open-unmarked-lessons.ts`. Pure, so the rules that
 * stop a mistyped production run are tested.
 */
import { utcMidnightFromDateStr } from '../../src/common/date/tashkent';

export const DEFAULT_FROM = '2026-09-01';

export const USAGE =
  'Usage: open-unmarked-lessons.ts [--from=YYYY-MM-DD] [--expect=<N>] [--apply]  (--apply requires --expect=<N>, the count the dry run printed)';

/** A refused command line: reported as a plain message, nothing is connected or written. */
export class UsageError extends Error {}

export interface OpenUnmarkedArgs {
  apply: boolean;
  from: string;
  expect: number | null;
}

/** A real calendar day: 2026-13-99 and 2026-02-30 do not survive the round trip. */
function isCalendarDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = utcMidnightFromDateStr(day);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day
  );
}

export function parseOpenUnmarkedArgs(argv: string[]): OpenUnmarkedArgs {
  const seen = new Set<string>();
  let apply = false;
  let from = DEFAULT_FROM;
  let expect: number | null = null;

  for (const arg of argv) {
    // Only these three exact shapes; `--from 2026-09-15`, `--from`, `--apply=1`
    // and anything else is refused rather than half-understood.
    const name =
      arg === '--apply' ? 'apply' : /^--(from|expect)=/.exec(arg)?.[1];
    if (!name) throw new UsageError(`Unknown argument "${arg}". ${USAGE}`);
    if (seen.has(name)) throw new UsageError(`--${name} given twice. ${USAGE}`);
    seen.add(name);

    if (name === 'apply') {
      apply = true;
    } else if (name === 'from') {
      from = arg.slice('--from='.length);
      if (!isCalendarDay(from)) {
        throw new UsageError(
          `--from must be a real day, YYYY-MM-DD, got "${from}".`,
        );
      }
    } else {
      const raw = arg.slice('--expect='.length);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
        throw new UsageError(`--expect must be a whole number, got "${raw}".`);
      }
      expect = Number(raw);
    }
  }

  if (apply && expect === null) {
    throw new UsageError(
      `--apply requires --expect=<N>: run the dry run first and pass the count it printed. ${USAGE}`,
    );
  }
  return { apply, from, expect };
}
