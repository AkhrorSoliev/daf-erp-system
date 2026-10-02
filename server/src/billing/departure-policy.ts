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

/**
 * Contract 3.5 (trial lesson) is in force for departures from this Tashkent
 * day: a first-time student who leaves after at most one lesson pays nothing.
 */
export const TRIAL_LESSON_START_DAY = '2026-10-01';

/**
 * The most lessons (PRESENT/LATE, every group) a student may have attended
 * and still leave on the trial-lesson rule. ABSENT does not count (CEO,
 * 28.09.2026): a student who came once and then stayed away is a trial.
 */
export const TRIAL_LESSON_MAX_HELD = 1;

/** A lesson on the student's roster still waiting on «Dars bo'ldimi?». */
export interface AwaitingLesson {
  /** Tashkent 'YYYY-MM-DD'. */
  date: string;
  groupName: string;
}

/**
 * Contract 3.5 cannot be decided while an unanswered lesson could still be
 * the student's second (CEO, 01.10.2026): the departure waits for the answer.
 * The removal and expulsion dialogs show the same words.
 */
export function trialAwaitsAnswerText(
  lessons: readonly AwaitingLesson[],
): string {
  const list = lessons
    .map((l) => `${l.date.slice(8, 10)}.${l.date.slice(5, 7)} (${l.groupName})`)
    .join(', ');
  const lessonWord = lessons.length > 1 ? 'darslarda' : 'darsda';
  return `Avval «Dars bo'ldimi?» savoliga javob bering: ${list}. Sinov darsi o'quvchi shu ${lessonWord} bo'lgan-bo'lmaganiga qarab hal bo'ladi.`;
}

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
  /** True when contract 3.5 (trial lesson) released the whole month. */
  trial: boolean;
}

export interface PolicyReleaseOptions {
  /**
   * The student has attended at most `TRIAL_LESSON_MAX_HELD` lessons in
   * all groups, and the caller is an actual departure (a removal or an
   * expulsion — not a freeze, a transfer or a centre closing).
   */
  trialLesson?: boolean;
}

/** Whether contract 3.5 applies to this departure. */
export function trialLessonApplies(
  input: DepartureReleaseInput,
  options?: PolicyReleaseOptions,
): boolean {
  return (
    options?.trialLesson === true &&
    input.departureDay >= TRIAL_LESSON_START_DAY
  );
}

/** Releases every covered lesson of the month, the ones already frozen out excluded. */
function wholeMonthRelease(
  input: DepartureReleaseInput,
): DepartureRelease | null {
  return departureRelease({
    ...input,
    departureDay: BEFORE_ANY_LESSON,
    lessonsThroughDeparture: 0,
  });
}

/**
 * The one rule for what a departure returns, shared by the write
 * (`reverseChargeForDeparture`) and the dialog's preview. «More than» the
 * threshold is strict: exactly 40% held still returns the unheld lessons.
 * A trial lesson (contract 3.5, `options.trialLesson`) wins over every policy.
 */
export function policyRelease(
  input: DepartureReleaseInput,
  policy: DeparturePolicy,
  thresholdPercent: number,
  options?: PolicyReleaseOptions,
): PolicyRelease {
  const share = heldShare(input);
  // Contract 3.5: a trial lesson is free whatever the policy says — the
  // month comes back whole, and nobody pays the teacher for it either
  // (`MonthlyChargeService.reverseTrialAccruals`, CEO 28.09.2026).
  if (trialLessonApplies(input, options)) {
    return {
      release: wholeMonthRelease(input),
      share,
      withheld: false,
      trial: true,
    };
  }
  if (policy === 'QUALITY_CLAIM') {
    return {
      release: wholeMonthRelease(input),
      share,
      withheld: false,
      trial: false,
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
    return { release: null, share, withheld: true, trial: false };
  }
  return { release, share, withheld: false, trial: false };
}
