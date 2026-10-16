import { addDaysToDateStr, dayOfWeekForDateStr } from '../common/date/tashkent';

/** One administrator's month as the «Diqqat» rules read it (spec §7.9). */
export interface KpiSignalInput {
  userId: number;
  name: string;
  /** ACTIVE results of the month, both types. */
  results: number;
  /** Of the compare month — in the current month, up to the same day. */
  compareResults: number;
  /** Leads held now. */
  held: number;
  /** An ACTIVE result in the last 7 days. */
  hasRecentResult: boolean;
  expired: number;
  compareExpired: number;
  promiseKept: number;
  /** KEPT + BROKEN; an OPEN promise does not count. */
  promiseClosed: number;
  leadsReceived: number;
  leadsPaid: number;
}

export type KpiSignalKind =
  | 'DROP'
  | 'SILENT'
  | 'EXPIRED'
  | 'PROMISE_LOW'
  | 'SURGE'
  | 'BEST_CONVERSION';

export interface KpiSignal {
  kind: KpiSignalKind;
  userId: number;
  tone: 'bad' | 'good';
  /** The sentence the page prints, its numbers included. */
  text: string;
  /** The bad kinds first (each kind its own hundred), then by size. */
  weight: number;
}

const MAX_SIGNALS = 5;
const TIER: Record<KpiSignalKind, number> = {
  DROP: 500,
  SILENT: 400,
  EXPIRED: 300,
  PROMISE_LOW: 200,
  SURGE: 100,
  BEST_CONVERSION: 0,
};
const share = (part: number, whole: number) => Math.round((part * 100) / whole);
const capped = (n: number) => Math.min(Math.max(n, 0), 99);

/** The «Diqqat» block (spec §7.9): five rules, every signal with its numbers, at most five. */
export function kpiSignals(
  users: readonly KpiSignalInput[],
  opts: {
    isCurrentMonth: boolean;
    /** False while the compare month was not fully recorded (before KPI_START): rule 1 is then silent. */
    compareRecorded: boolean;
  },
): KpiSignal[] {
  const out: KpiSignal[] = [];
  const push = (
    kind: KpiSignalKind,
    u: KpiSignalInput,
    text: string,
    size: number,
  ) => {
    out.push({
      kind,
      userId: u.userId,
      tone: kind === 'SURGE' || kind === 'BEST_CONVERSION' ? 'good' : 'bad',
      text: `${u.name}: ${text}`,
      weight: TIER[kind] + capped(size),
    });
  };

  for (const u of users) {
    // 1. ±30% against the compare month, at least 3 results in one of them.
    if (
      opts.compareRecorded &&
      u.results !== u.compareResults &&
      Math.max(u.results, u.compareResults) >= 3
    ) {
      const change =
        u.compareResults === 0
          ? null
          : share(u.results - u.compareResults, u.compareResults);
      // The threshold is tested on the integers; `change` is only for the text.
      if (
        u.compareResults === 0 ||
        Math.abs(u.results - u.compareResults) * 100 >= 30 * u.compareResults
      ) {
        const up = u.results > u.compareResults;
        const tail =
          change === null ? '' : ` (${up ? '+' : '-'}${Math.abs(change)}%)`;
        push(
          up ? 'SURGE' : 'DROP',
          u,
          `natijalar keskin ${up ? 'oshdi' : 'kamaydi'} — ${u.compareResults} → ${u.results}${tail}`,
          change === null ? 99 : Math.abs(change),
        );
      }
    }
    // 2. Silent: 3 held leads or more, no result in 7 days (current month only).
    if (opts.isCurrentMonth && u.held >= 3 && !u.hasRecentResult) {
      push(
        'SILENT',
        u,
        `${u.held} ta band lid bor, oxirgi 7 kunda natija yo'q`,
        u.held,
      );
    }
    // 3. Many returned: 3 or more, and more than in the compare month.
    if (u.expired >= 3 && u.expired > u.compareExpired) {
      push(
        'EXPIRED',
        u,
        `${u.expired} ta lid muddat o'tib qaytdi (taqqoslanayotgan oyda ${u.compareExpired} ta)`,
        u.expired,
      );
    }
    // 4. Promises: under 30% of at least 5 closed.
    if (u.promiseClosed >= 5) {
      // Floored so a rate under 30% never prints as "30%".
      const rate = Math.floor((u.promiseKept * 100) / u.promiseClosed);
      if (u.promiseKept * 100 < 30 * u.promiseClosed) {
        push(
          'PROMISE_LOW',
          u,
          `va'da bajarilishi ${rate}% (${u.promiseKept} / ${u.promiseClosed})`,
          30 - rate,
        );
      }
    }
  }

  // 5. The best lead → payment share among those with 5 leads or more.
  const best = users
    .filter((u) => u.leadsReceived >= 5 && u.leadsPaid > 0)
    .sort(
      (a, b) =>
        b.leadsPaid / b.leadsReceived - a.leadsPaid / a.leadsReceived ||
        b.leadsReceived - a.leadsReceived,
    )[0];
  if (best) {
    const rate = share(best.leadsPaid, best.leadsReceived);
    push(
      'BEST_CONVERSION',
      best,
      `eng yuqori «Lid → to'lov» — ${rate}% (${best.leadsPaid} / ${best.leadsReceived})`,
      rate,
    );
  }

  return out
    .sort((a, b) => b.weight - a.weight || a.text.localeCompare(b.text))
    .slice(0, MAX_SIGNALS);
}

/** The month's Monday–Saturday days that are not a holiday ('YYYY-MM-DD'). */
export function workingDaysOfMonth(
  month: string,
  isHoliday: (day: string) => boolean,
): string[] {
  const out: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDaysToDateStr(d, 1)) {
    if (dayOfWeekForDateStr(d) !== 0 && !isHoliday(d)) out.push(d);
  }
  return out;
}

/**
 * «Oy oxiriga taxmin» (spec §7.9): the month's results so far ÷ the working
 * days passed (today included) × the month's working days, rounded, both
 * counted from `since` (the Tashkent day results started being written).
 * Shown only from the 3rd such working day.
 */
export function monthEndForecast(
  results: number,
  workingDays: readonly string[],
  today: string,
  since: string,
): number | null {
  // Only days on which results were being written count: before KPI_START or
  // while the switch was off nothing could be earned, and dividing by those
  // days would understate the month.
  const counted = workingDays.filter((d) => d >= since);
  const passed = counted.filter((d) => d <= today).length;
  if (passed < 3) return null;
  return Math.round((results * counted.length) / passed);
}
