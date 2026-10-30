/**
 * Pure plan for `scripts/repair-departure-chain-refund.ts` (ADR-0140).
 *
 * Before ADR-0140 a student put back into the same group in the same month had
 * no month charge of his own (the earlier enrollment's charge still held the
 * dates), so when he left again `loadDepartureInput` found nothing and refunded
 * nothing. This finds those departures and prices the refund the departure
 * would have made, by the same `policyRelease` rule.
 *
 * Policy is CENTER_INITIATIVE (the unheld days come back, contract 6.2 does not
 * keep them): the person who lists a student has already decided that. The
 * 6.2 outcome is printed beside it so a withheld case is visible.
 */
import { DepartureReleaseInput } from '../../src/billing/departure-release';
import { policyRelease } from '../../src/billing/departure-policy';

export interface ChainEnrollment {
  id: string;
  studentId: number;
  groupId: string;
  groupName: string;
  status: string;
  createdAt: Date;
  /** Tashkent 'YYYY-MM-DD' of `statusChangedAt`. */
  departureDay: string;
}

export interface ChainCharge {
  id: string;
  enrollmentId: string;
  enrollmentCreatedAt: Date;
  studentId: number;
  groupId: string;
  branchId: number;
  companyId: number;
  periodYear: number;
  periodMonth: number;
  coveredDates: string[];
  frozenOutDates: string[];
  coveredLessons: number;
  perLessonCost: number;
  discountPercent: number;
  chargedAmount: number;
}

export interface ChainRefund {
  enrollmentId: string;
  /** The enrollment whose charge holds the money. */
  chargeEnrollmentId: string;
  chargeId: string;
  studentId: number;
  groupName: string;
  branchId: number;
  companyId: number;
  period: string;
  departureDay: string;
  lessons: number;
  amount: number;
  dates: string[];
  /** What contract 6.2 would have done instead (information only). */
  withheldUnder62: boolean;
}

const NO_REFUND_AFTER_PERCENT = 40;

const asInput = (c: ChainCharge, day: string): DepartureReleaseInput => ({
  departureDay: day,
  coveredDates: c.coveredDates,
  frozenOutDates: c.frozenOutDates,
  coveredLessons: c.coveredLessons,
  perLessonCost: c.perLessonCost,
  discountPercent: c.discountPercent,
  chargedAmount: c.chargedAmount,
  lessonsThroughDeparture: 0,
});

/** What leaving on `day` gives back from `charge`, or null when nothing. */
export function chainRelease(charge: ChainCharge, day: string) {
  const r = policyRelease(asInput(charge, day), 'CENTER_INITIATIVE', 0);
  if (!r.release) return null;
  const before = new Set(charge.frozenOutDates);
  return {
    lessons: r.release.lessons,
    amount: r.release.amount,
    frozenOutAfter: r.release.frozenOutAfter ?? charge.frozenOutDates,
    dates: (r.release.frozenOutAfter ?? []).filter((d) => !before.has(d)),
  };
}

export function planChainRefunds(
  enrollments: ChainEnrollment[],
  charges: ChainCharge[],
): ChainRefund[] {
  // Working copy: two chained enrollments of one charge must not both refund a day.
  const live = new Map(charges.map((c) => [c.id, { ...c }]));
  const out: ChainRefund[] = [];

  const ordered = [...enrollments]
    .filter((e) => e.status !== 'ACTIVE')
    .sort((a, b) => a.departureDay.localeCompare(b.departureDay));

  for (const e of ordered) {
    const year = Number(e.departureDay.slice(0, 4));
    const month = Number(e.departureDay.slice(5, 7));
    const inMonth = [...live.values()].filter(
      (c) =>
        c.studentId === e.studentId &&
        c.periodYear === year &&
        c.periodMonth === month,
    );
    // An enrollment with a charge of its own was settled by the normal path.
    if (inMonth.some((c) => c.enrollmentId === e.id)) continue;

    const holder = inMonth
      .filter(
        (c) =>
          c.groupId === e.groupId &&
          c.enrollmentId !== e.id &&
          c.enrollmentCreatedAt < e.createdAt,
      )
      .sort(
        (a, b) =>
          a.enrollmentCreatedAt.getTime() - b.enrollmentCreatedAt.getTime(),
      )
      .find((c) => {
        const out = new Set(c.frozenOutDates);
        return c.coveredDates.some((d) => d > e.departureDay && !out.has(d));
      });
    if (!holder) continue;

    const r = chainRelease(holder, e.departureDay);
    if (!r || r.amount <= 0) continue;
    const under62 = policyRelease(
      asInput(holder, e.departureDay),
      'STUDENT_CANCELLED',
      NO_REFUND_AFTER_PERCENT,
    );

    out.push({
      enrollmentId: e.id,
      chargeEnrollmentId: holder.enrollmentId,
      chargeId: holder.id,
      studentId: e.studentId,
      groupName: e.groupName,
      branchId: holder.branchId,
      companyId: holder.companyId,
      period: `${year}-${String(month).padStart(2, '0')}`,
      departureDay: e.departureDay,
      lessons: r.lessons,
      amount: r.amount,
      dates: r.dates,
      withheldUnder62: under62.withheld,
    });
    holder.frozenOutDates = r.frozenOutAfter;
    holder.chargedAmount -= r.amount;
    holder.coveredLessons =
      holder.coveredDates.length - r.frozenOutAfter.length;
  }
  return out;
}
