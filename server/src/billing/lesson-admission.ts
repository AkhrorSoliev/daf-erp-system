import { departureRelease } from './departure-release';
import { paymentDueDate } from './payment-due-date';

/**
 * Contract 3.2 (ADR-0047): the first lesson of a month may be attended
 * unpaid; from the 2nd a student attends only as far as their payments
 * reach, older debt included. It applies to lessons from the new contract's
 * first day.
 */
export const ADMISSION_START_DAY = '2026-10-01';

export type AdmissionReason =
  | 'NOT_APPLIED'
  | 'FIRST_LESSON'
  | 'PAID'
  | 'NOT_PAID'
  /**
   * An edit after the lesson: the register a manual save took left the
   * student out (`leftOutAfterEnd`), and a payment since does not put him in.
   */
  | 'LEFT_OUT';

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

export const LEFT_OUT: LessonAdmission = {
  admitted: false,
  reason: 'LEFT_OUT',
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
export function groupLessons(
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

/**
 * The lesson comes before the student's 2nd lesson of the month in the group
 * (`paymentDueDate`): contract 3.2's lesson that may be attended unpaid.
 * `lessons` are that group-month's lessons (`groupLessons`); with fewer than
 * two, every lesson of the month is the first.
 */
export function isFirstLessonOfMonth(
  lessons: readonly string[],
  lessonDay: string,
): boolean {
  const secondLesson = paymentDueDate(lessons);
  return secondLesson === null || lessonDay < secondLesson;
}

export function lessonAdmission(input: {
  lessonDay: string;
  groupId: string;
  balance: number;
  /** The lesson month's charges. */
  charges: readonly AdmissionCharge[];
  /**
   * The student's charges of later months. The balance already carries
   * them and money settles the oldest charge first, so they count as still
   * held: posted since the lesson, they must not keep a student who paid the
   * lesson's month out of it («Bo'ldi» or an edit on 02.11 for 29.10).
   */
  laterCharges?: readonly AdmissionCharge[];
}): LessonAdmission {
  if (input.lessonDay < ADMISSION_START_DAY) return ADMITTED_WITHOUT_RULE;
  const lessons = groupLessons(input.charges, input.groupId);
  // No charge in this group for the month: nothing to measure against. The
  // monthly cron writes one on the 1st; until it does the rule stays out of
  // the way instead of blocking on missing data.
  if (lessons.length === 0) return ADMITTED_WITHOUT_RULE;

  if (isFirstLessonOfMonth(lessons, input.lessonDay)) {
    return {
      admitted: true,
      reason: 'FIRST_LESSON',
      shortfall: 0,
      paidThrough: null,
    };
  }

  const held = [...input.charges, ...(input.laterCharges ?? [])];
  const reach = input.balance + heldAfter(held, input.lessonDay);
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
      if (input.balance + heldAfter(held, day) < 0) break;
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
 * How far a payment reaches this month (the payment dialog, ADR-0047).
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
    const groupName =
      input.charges.find((c) => c.groupId === groupId)?.groupName ?? '';
    for (const day of lessons) {
      if (day < input.today) continue;
      upcoming.push({
        day,
        groupName,
        free: isFirstLessonOfMonth(lessons, day),
      });
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

/** A CHARGED month charge of any enrollment, with its period and owner. */
export interface CoverageCharge extends AdmissionCharge {
  enrollmentId: string;
  periodYear: number;
  periodMonth: number;
}

export interface FirstLessonCoverage {
  /**
   * The lesson is the student's first of its month in the group, read from
   * the charge that billed it. No such charge: false.
   */
  firstLesson: boolean;
  /**
   * The student's payments reach it: `balance + heldAfter(charges, day) ≥ 0`
   * over every charge from the lesson's month on. Money settles the oldest
   * charge first, so a later month's charge counts as still held — posted
   * since the lesson, it must not hide a payment that already covered it.
   * Within the lesson's month it is exactly contract 3.2's reach.
   */
  covered: boolean;
  /** The enrollment whose charge bills the lesson; null when none does. */
  enrollmentId: string | null;
}

/**
 * ADR-0048 (R4): the centre covers a debtor's first lesson of the month for
 * the teacher only when the student came. An ABSENT there accrues when this
 * reads `firstLesson && covered` — at the lesson, or on the payment that
 * reaches it. `charges`: the student's CHARGED charges from the lesson's
 * month on, whatever the enrollment's status now — a group the student has
 * since left still billed the lessons it held.
 */
export function firstLessonCoverage(input: {
  lessonDay: string;
  groupId: string;
  balance: number;
  charges: readonly CoverageCharge[];
}): FirstLessonCoverage {
  const [year, month] = input.lessonDay.split('-').map(Number);
  const fromMonth = year * 12 + month;
  const charges = input.charges.filter(
    (c) => c.periodYear * 12 + c.periodMonth >= fromMonth,
  );
  // The charge that billed the lesson. Its own dates decide the first lesson,
  // as contract 3.2 reads the enrollment on the roster: a student who left
  // and rejoined the group this month starts a new first lesson.
  const owner =
    charges.find(
      (c) =>
        c.groupId === input.groupId &&
        c.periodYear === year &&
        c.periodMonth === month &&
        c.coveredDates.includes(input.lessonDay) &&
        !c.frozenOutDates.includes(input.lessonDay),
    ) ?? null;
  return {
    firstLesson:
      owner !== null &&
      isFirstLessonOfMonth(
        groupLessons([owner], input.groupId),
        input.lessonDay,
      ),
    covered: input.balance + heldAfter(charges, input.lessonDay) >= 0,
    enrollmentId: owner?.enrollmentId ?? null,
  };
}
