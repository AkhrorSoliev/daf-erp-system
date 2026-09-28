import { departureRelease } from './departure-release';
import { paymentDueDate } from './payment-due-date';

/**
 * Contract 3.2 (ADR-0046): the first lesson of a month may be attended
 * unpaid; from the 2nd a student attends only as far as their payments
 * reach, older debt included. It applies to lessons from the new contract's
 * first day.
 */
export const ADMISSION_START_DAY = '2026-10-01';

export type AdmissionReason =
  | 'NOT_APPLIED'
  | 'FIRST_LESSON'
  | 'PAID'
  | 'NOT_PAID';

export interface LessonAdmission {
  admitted: boolean;
  reason: AdmissionReason;
  /** The least payment that admits the student to this lesson; 0 when admitted. */
  shortfall: number;
  /**
   * Admitted while still owing (a part payment): the last lesson of the
   * month in this group the current balance reaches. Null otherwise.
   */
  paidThrough: string | null;
}

export const ADMITTED_WITHOUT_RULE: LessonAdmission = {
  admitted: true,
  reason: 'NOT_APPLIED',
  shortfall: 0,
  paidThrough: null,
};

/** One CHARGED month charge of an ACTIVE enrollment. */
export interface AdmissionCharge {
  groupId: string;
  coveredDates: readonly string[];
  frozenOutDates: readonly string[];
  coveredLessons: number;
  /** Undiscounted, as stored; `departureRelease` applies the discount. */
  perLessonCost: number;
  discountPercent: number;
  chargedAmount: number;
}

/**
 * What the month's charges still hold for lessons after `day` — the same
 * figure a departure on `day` would credit back (`departureRelease`), so the
 * lesson on `day` itself counts as held.
 */
export function heldAfter(
  charges: readonly AdmissionCharge[],
  day: string,
): number {
  let total = 0;
  for (const c of charges) {
    const release = departureRelease({
      departureDay: day,
      coveredDates: c.coveredDates,
      frozenOutDates: c.frozenOutDates,
      coveredLessons: c.coveredLessons,
      perLessonCost: c.perLessonCost,
      discountPercent: c.discountPercent,
      chargedAmount: c.chargedAmount,
      // A row without dates predates October; release all of it so the rule
      // never blocks on data it cannot read.
      lessonsThroughDeparture: 0,
    });
    total += release?.amount ?? 0;
  }
  return total;
}

/** The student's lessons in one group this month, frozen-out ones excluded, sorted. */
function groupLessons(
  charges: readonly AdmissionCharge[],
  groupId: string,
): string[] {
  const days = new Set<string>();
  for (const c of charges) {
    if (c.groupId !== groupId) continue;
    const out = new Set(c.frozenOutDates);
    for (const d of c.coveredDates) if (!out.has(d)) days.add(d);
  }
  return [...days].sort();
}

export function lessonAdmission(input: {
  lessonDay: string;
  groupId: string;
  balance: number;
  charges: readonly AdmissionCharge[];
}): LessonAdmission {
  if (input.lessonDay < ADMISSION_START_DAY) return ADMITTED_WITHOUT_RULE;
  const lessons = groupLessons(input.charges, input.groupId);
  // No charge in this group for the month: nothing to measure against. The
  // monthly cron writes one on the 1st; until it does the rule stays out of
  // the way instead of blocking on missing data.
  if (lessons.length === 0) return ADMITTED_WITHOUT_RULE;

  const secondLesson = paymentDueDate(lessons);
  if (secondLesson === null || input.lessonDay < secondLesson) {
    return {
      admitted: true,
      reason: 'FIRST_LESSON',
      shortfall: 0,
      paidThrough: null,
    };
  }

  const reach = input.balance + heldAfter(input.charges, input.lessonDay);
  if (reach < 0) {
    return {
      admitted: false,
      reason: 'NOT_PAID',
      shortfall: -reach,
      paidThrough: null,
    };
  }

  let paidThrough: string | null = null;
  if (input.balance < 0) {
    paidThrough = input.lessonDay;
    for (const day of lessons) {
      if (day <= input.lessonDay) continue;
      if (input.balance + heldAfter(input.charges, day) < 0) break;
      paidThrough = day;
    }
  }
  return { admitted: true, reason: 'PAID', shortfall: 0, paidThrough };
}

export interface PaymentReach {
  /** The last lesson from today the new balance admits; null when not even the next one. */
  paidThrough: string | null;
  /** The first lesson from today the new balance does not admit, and what it still needs. */
  next: { date: string; groupName: string; needed: number } | null;
  /** The new balance leaves no debt: no promise is needed. */
  clearsDebt: boolean;
}

/**
 * How far a payment reaches this month (the payment dialog, ADR-0046).
 * Null when the rule does not apply or no lesson is left this month.
 */
export function paymentReach(input: {
  today: string;
  balanceAfter: number;
  charges: readonly (AdmissionCharge & { groupName: string })[];
}): PaymentReach | null {
  if (input.today < ADMISSION_START_DAY) return null;

  const upcoming: { day: string; groupName: string; free: boolean }[] = [];
  for (const groupId of new Set(input.charges.map((c) => c.groupId))) {
    const lessons = groupLessons(input.charges, groupId);
    if (lessons.length === 0) continue;
    const second = paymentDueDate(lessons);
    const groupName =
      input.charges.find((c) => c.groupId === groupId)?.groupName ?? '';
    for (const day of lessons) {
      if (day < input.today) continue;
      upcoming.push({ day, groupName, free: second === null || day < second });
    }
  }
  if (upcoming.length === 0) return null;
  upcoming.sort(
    (a, b) =>
      a.day.localeCompare(b.day) || a.groupName.localeCompare(b.groupName),
  );

  if (input.balanceAfter >= 0) {
    return {
      paidThrough: upcoming[upcoming.length - 1].day,
      next: null,
      clearsDebt: true,
    };
  }

  let paidThrough: string | null = null;
  for (const lesson of upcoming) {
    const reach = input.balanceAfter + heldAfter(input.charges, lesson.day);
    if (!lesson.free && reach < 0) {
      return {
        paidThrough,
        next: { date: lesson.day, groupName: lesson.groupName, needed: -reach },
        clearsDebt: false,
      };
    }
    paidThrough = lesson.day;
  }
  return { paidThrough, next: null, clearsDebt: false };
}
