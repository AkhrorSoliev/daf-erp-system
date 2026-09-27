import {
  DepartureRelease,
  DepartureReleaseInput,
  departureRelease,
} from './departure-release';

/**
 * Who ended a MONTHLY enrollment, which decides what the month's charge gives
 * back (contract 6.2, ADR-0043):
 * - `STUDENT_CANCELLED` — the student's own decision (the default): the
 *   unheld lessons come back only while at most the threshold share of the
 *   month was held; above it nothing comes back.
 * - `LEVEL_COMPLETED` — the student finished the level (A1, A2…), with a
 *   certificate or to move up later: the contract is fulfilled (10.1), not
 *   cancelled, so the unheld lessons come back (contract 3.4).
 * - `CENTER_INITIATIVE` — the centre ended it: the unheld lessons come back
 *   (the rule before the contract, and still the rule for freezes, transfers
 *   and centre-initiated closures).
 * - `QUALITY_CLAIM` — a justified complaint: the whole month comes back.
 */
export const DEPARTURE_POLICIES = [
  'STUDENT_CANCELLED',
  'LEVEL_COMPLETED',
  'CENTER_INITIATIVE',
  'QUALITY_CLAIM',
] as const;
export type DeparturePolicy = (typeof DEPARTURE_POLICIES)[number];

export const DEFAULT_DEPARTURE_POLICY: DeparturePolicy = 'STUDENT_CANCELLED';

/** The contract carrying rule 6.2 is in force for departures from this Tashkent day. */
export const CONTRACT_62_START_DAY = '2026-10-01';

/** A departure day before every lesson date: releases the whole month. */
const BEFORE_ANY_LESSON = '0000-00-00';

export interface HeldShare {
  /** Covered lessons held up to and including the departure day. */
  held: number;
  /** Covered lessons of the month, the ones already frozen out excluded. */
  covered: number;
  /** `held / covered` as a whole percent, for display only. */
  percent: number;
}

/** How much of the student's month was held by the departure day. */
export function heldShare(input: DepartureReleaseInput): HeldShare {
  let held: number;
  let covered: number;
  if (input.coveredDates.length > 0) {
    const out = new Set(input.frozenOutDates);
    const live = input.coveredDates.filter((d) => !out.has(d));
    covered = live.length;
    held = live.filter((d) => d <= input.departureDay).length;
  } else {
    // Legacy row: no dates to read, only counts.
    covered = input.coveredLessons;
    held = Math.min(input.lessonsThroughDeparture, input.coveredLessons);
  }
  const percent = covered > 0 ? Math.round((held * 100) / covered) : 0;
  return { held, covered, percent };
}

export interface PolicyRelease {
  /** What goes back to the balance; null when nothing does. */
  release: DepartureRelease | null;
  share: HeldShare;
  /**
   * True when rule 6.2 kept money that would otherwise have come back. A
   * month with nothing left to return (its last lesson is past, or a freeze
   * already returned the rest) is never «withheld»: the rule kept nothing.
   */
  withheld: boolean;
}

/**
 * The one rule for what a departure returns, shared by the write
 * (`reverseChargeForDeparture`) and the dialog's preview. «More than» the
 * threshold is strict: exactly 40% held still returns the unheld lessons.
 */
export function policyRelease(
  input: DepartureReleaseInput,
  policy: DeparturePolicy,
  thresholdPercent: number,
): PolicyRelease {
  const share = heldShare(input);
  if (policy === 'QUALITY_CLAIM') {
    return {
      release: departureRelease({
        ...input,
        departureDay: BEFORE_ANY_LESSON,
        lessonsThroughDeparture: 0,
      }),
      share,
      withheld: false,
    };
  }
  const release = departureRelease(input);
  const ruleApplies =
    policy === 'STUDENT_CANCELLED' &&
    input.departureDay >= CONTRACT_62_START_DAY;
  if (
    release &&
    ruleApplies &&
    share.held * 100 > thresholdPercent * share.covered
  ) {
    return { release: null, share, withheld: true };
  }
  return { release, share, withheld: false };
}
