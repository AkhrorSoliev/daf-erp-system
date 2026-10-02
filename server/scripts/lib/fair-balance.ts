/**
 * Fair-balance reconciliation for one student — pure math, no queries. Shared
 * by `check-student.ts` (one student) and `audit-overcharged-students.ts`
 * (every student), so the two can never disagree.
 *
 *   fairPosition = moneyIn − fair fee
 *   position     = balance + held prepaid value
 *   difference   = fairPosition − position   (> 0 charged too much, < 0 too little)
 *
 * The fair fee has two regimes. From MONTHLY_START a MONTHLY course bills the
 * month up front (EnrollmentMonthlyCharge: prorated for a mid-month join,
 * minus excused-lesson credits, discount applied), so the fair fee of a lesson
 * in a charged month is that charge — pricing it by attendance made every
 * monthly student look overcharged by the lessons not held yet. Every other
 * billable lesson was billed one by one at the package rate in force then:
 * the nominal (undiscounted) per-lesson price of the LESSON_DEDUCTION that
 * funded it. The course's price today is a different number (33 333 → 41 667
 * for #10082).
 */
import { SYSTEM_START, day } from './check-cli';

// Calendar-month billing, backdated to this day when it shipped on 26.09.2026
// (docs/superpowers/specs/2026-09-02-oylik-tolov-tizimi-design.md).
export const MONTHLY_START = '2026-09-01';

export interface FairEnrollment {
  groupId: string;
  status: string;
  startDate: Date | null;
  prepaidLessonsRemaining: number;
}
export interface FairAttendance {
  id: string;
  date: Date;
  status: string;
  groupId: string;
}
export interface FairTxn {
  type: string;
  amount: number;
  reversedAt: Date | null;
  reversedTransactionId: string | null;
  attendanceId: string | null;
  enrollmentId: string | null;
  createdAt: Date;
  metadata: unknown;
}
export interface FairCharge {
  groupId: string;
  periodYear: number;
  periodMonth: number;
  status: string;
  chargedAmount: number;
  /** 'YYYY-MM-DD' lessons the charge covers; empty on rows written before the column. */
  coveredDates: string[];
}

export interface FairInput {
  balance: number;
  discountPercent: number;
  /** Course price / cycle length per group, TODAY: prepaid value, and the last-resort rate. */
  todayRate: Map<string, number>;
  enrollments: FairEnrollment[];
  attendance: FairAttendance[];
  txns: FairTxn[];
  charges: FairCharge[];
}

export const chargeMonth = (c: Pick<FairCharge, 'periodYear' | 'periodMonth'>) =>
  `${c.periodYear}-${String(c.periodMonth).padStart(2, '0')}`;

/** CLAUDE.md billing matrix: PRESENT/LATE/ABSENT are billable ("lesson held = lesson paid"). */
export function billableTest(enrollments: FairEnrollment[]) {
  // Earliest startDate per group; '' = no limit. An enrollment without a start
  // date bills from its first lesson, so it wins over a dated re-enrollment in
  // the same group — letting the dated one win dropped #10640's June–August
  // lessons and read as a 1 439 000 overcharge.
  const startByGroup = new Map<string, string>();
  for (const e of enrollments) {
    const sd = e.startDate ? day(e.startDate) : '';
    const cur = startByGroup.get(e.groupId);
    if (cur === undefined || !sd || (cur && sd < cur)) startByGroup.set(e.groupId, sd);
  }
  return (a: FairAttendance) => {
    const d = day(a.date);
    const start = startByGroup.get(a.groupId);
    return ['PRESENT', 'LATE', 'ABSENT'].includes(a.status) && d >= SYSTEM_START && (!start || d >= start);
  };
}

export function fairBalance(input: FairInput) {
  const discMul = 1 - (input.discountPercent || 0) / 100;

  let prepaidValue = 0;
  let prepaidCount = 0;
  for (const e of input.enrollments) {
    if (e.status === 'ACTIVE' && e.prepaidLessonsRemaining > 0) {
      prepaidValue += e.prepaidLessonsRemaining * (input.todayRate.get(e.groupId) ?? 0);
      prepaidCount += e.prepaidLessonsRemaining;
    }
  }
  prepaidValue = Math.round(prepaidValue * discMul);

  const isBillable = billableTest(input.enrollments);
  const billable = input.attendance.filter(isBillable);
  const billableBeforeMonthly = billable.filter((a) => day(a.date) < MONTHLY_START).length;

  const liveCharges = input.charges.filter((c) => c.status === 'CHARGED');
  // A lesson is the charge's when its date is one the charge covers — not
  // merely in the charge's group and month: a student who left a group early
  // in September and rejoined it later has the early lessons billed one by one
  // and a charge only from the rejoin (#10622). Rows without coveredDates fall
  // back to the whole month.
  const covered = new Set(
    liveCharges.flatMap((c) =>
      c.coveredDates.length ? c.coveredDates.map((d) => `${c.groupId}|${d}`) : [`${c.groupId}|${chargeMonth(c)}`],
    ),
  );
  const monthlyFee = liveCharges.reduce((acc, c) => acc + c.chargedAmount, 0);

  // The consumption row carries the course price ON THE LESSON DAY, which is
  // not what a lesson taken from an earlier package cost: #10617's August
  // package at 33 333 was consumed in September as 37 500. The funding batch
  // is the enrollment's latest deduction at consumption time — the same
  // coverage rule billing uses — so its price wins when there is one: its
  // amount over the lessons it covered, which already carries the discount
  // it was billed with. The student's percent today is not that one (#10473
  // got 10% only in late September, and its May batch records no percent).
  const meta = (t: FairTxn) =>
    (t.metadata ?? {}) as { perLessonCost?: unknown; discountPercent?: unknown; lessonsCovered?: unknown };
  const rateOf = (t: FairTxn) => Number(meta(t).perLessonCost ?? 0);
  const priceOf = (t: FairTxn) => {
    const { lessonsCovered, discountPercent } = meta(t);
    if (typeof lessonsCovered === 'number' && lessonsCovered > 0) return -t.amount / lessonsCovered;
    return rateOf(t) * (typeof discountPercent === 'number' ? 1 - discountPercent / 100 : discMul);
  };
  const batches = new Map<string, FairTxn[]>(); // enrollmentId → deductions, oldest first
  for (const t of [...input.txns].sort((x, y) => +x.createdAt - +y.createdAt)) {
    if (t.type === 'LESSON_DEDUCTION' && t.amount < 0 && t.reversedTransactionId == null && t.enrollmentId && rateOf(t) > 0)
      batches.set(t.enrollmentId, [...(batches.get(t.enrollmentId) ?? []), t]);
  }
  const rateByAttendance = new Map<string, number>();
  for (const t of input.txns) {
    if (t.type !== 'LESSON_CONSUMPTION' || t.reversedTransactionId != null || !t.attendanceId) continue;
    const batch = (batches.get(t.enrollmentId ?? '') ?? []).filter((b) => +b.createdAt <= +t.createdAt).pop();
    const price = batch ? priceOf(batch) : rateOf(t) * discMul;
    if (price > 0) rateByAttendance.set(t.attendanceId, price);
  }
  const lessonBilled = billable.filter((a) => {
    const d = day(a.date);
    return !(d >= MONTHLY_START && (covered.has(`${a.groupId}|${d}`) || covered.has(`${a.groupId}|${d.slice(0, 7)}`)));
  });
  const priced = lessonBilled.filter((a) => rateByAttendance.has(a.id));
  const nearest = (a: FairAttendance, pool: FairAttendance[]) =>
    pool.reduce<FairAttendance | undefined>(
      (best, p) => (!best || Math.abs(+p.date - +a.date) < Math.abs(+best.date - +a.date) ? p : best),
      undefined,
    );
  let lessonFee = 0;
  let guessedFee = 0;
  let guessed = 0;
  for (const a of lessonBilled) {
    let rate = rateByAttendance.get(a.id);
    if (!rate) {
      // A lesson nobody billed takes the rate of the nearest billed lesson,
      // same group first; today's price only when the student has none.
      // Counted in `guessed` so the output says it is an estimate.
      const near = nearest(a, priced.filter((p) => p.groupId === a.groupId)) ?? nearest(a, priced);
      rate = near ? rateByAttendance.get(near.id)! : (input.todayRate.get(a.groupId) ?? 0) * discMul;
      guessed++;
      guessedFee += rate;
    }
    lessonFee += rate;
  }

  // Reversed originals and reversal rows both stay out: the pair nets to zero.
  // ADJUSTMENTs stay out too: every kind on prod (prepaid release,
  // monthly-release, april-cutover-refund, overcharge*) corrects a charge, and
  // the fair fee above is already the corrected one — #10024's
  // overcharge-monthly-carried-in +199 998 undoes 6 September lessons the
  // package billed on top of the September charge. They reach the real
  // position through the balance.
  const moneyIn = input.txns
    .filter(
      (t) =>
        t.reversedAt == null &&
        t.reversedTransactionId == null &&
        !['LESSON_DEDUCTION', 'ADJUSTMENT', 'DISCOUNT_ADJUSTMENT', 'LESSON_CONSUMPTION'].includes(t.type),
    )
    .reduce((acc, t) => acc + t.amount, 0);
  const adjustments = input.txns.filter((t) => t.type === 'ADJUSTMENT');
  const adjustmentSum = adjustments.reduce((acc, t) => acc + t.amount, 0);
  const overchargeSum = adjustments
    .filter((t) => String((t.metadata as { marker?: unknown } | null)?.marker ?? '').startsWith('overcharge'))
    .reduce((acc, t) => acc + t.amount, 0);

  // Two credits re-price lessons the fee above prices at their batch's
  // original price, so they lower the fee rather than count as money in:
  // a batch re-pricing (metadata old/newPerLesson — the 06.06.2026 intensive
  // fix, 57 500 → 34 500) and DISCOUNT_ADJUSTMENT, a discount handed back on
  // lessons already billed in full (#10080: +449 995).
  const rateCorrection = input.txns
    .filter(
      (t) =>
        t.type === 'DISCOUNT_ADJUSTMENT' ||
        (t.type === 'ADJUSTMENT' && typeof (t.metadata as { newPerLesson?: unknown } | null)?.newPerLesson === 'number'),
    )
    .reduce((acc, t) => acc + t.amount, 0);
  const fairLessonFee = Math.round(lessonFee) - rateCorrection;
  const fairPosition = moneyIn - fairLessonFee - monthlyFee;
  const position = input.balance + prepaidValue;
  return {
    prepaidValue,
    prepaidCount,
    isBillable,
    billableCount: billable.length,
    billableBeforeMonthly,
    lessonBilledCount: lessonBilled.length,
    guessed,
    guessedFee: Math.round(guessedFee),
    fairLessonFee,
    monthlyFee,
    liveChargeCount: liveCharges.length,
    monthlyLessons: billable.length - lessonBilled.length,
    moneyIn,
    adjustmentSum,
    overchargeSum,
    rateCorrection,
    fairPosition,
    position,
    difference: fairPosition - position,
  };
}
