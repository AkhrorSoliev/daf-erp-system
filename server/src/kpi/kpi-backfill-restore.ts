import { LeadConversionKind } from '@prisma/client';
import {
  enrollmentStatusOn,
  supplyOpeningRow,
  type EnrollmentStatusEvent,
} from '../students/shared/enrollment-status-on';

/**
 * What the one-time backfill restores for the days between KPI_START and the
 * deploy (spec §7.6): the facts stage 2 now writes live, but nobody wrote then.
 */

export interface EnrollmentAtConversion {
  createdAt: Date;
  statusChangedAt: Date | null;
  status: string;
  /** `EnrollmentStateLog` rows, ascending by `transitionAt`. */
  log: EnrollmentStatusEvent[];
  /**
   * The group is ACTIVE and not deleted. The live rule (`activeStudentWhere`)
   * asks it NOW; the backfill has only the group's current state, which is
   * what it uses for the conversion moment too.
   */
  groupActive: boolean;
}

/**
 * The kind of a lead converted before stage 2 shipped. A lead not linked to
 * an existing card opened a new student. A linked lead brought back a
 * student who was not studying at the conversion (RETURNING), or earned
 * nothing (ALREADY_STUDYING). "Studying" follows the live «faol o'quvchi»
 * rule (`activeStudentWhere`): the student is ACTIVE and has an enrollment
 * that read ACTIVE at that moment (`enrollmentStatusOn`) in an ACTIVE group.
 * A stale ACTIVE enrollment left in a completed or deleted group does not
 * count. ponytail: the student's and the group's CURRENT status stand in for
 * their status at the conversion (no history of either is kept).
 */
export function restoredConversionKind(
  linked: boolean,
  enrollments: readonly EnrollmentAtConversion[],
  at: Date,
  studentActive: boolean,
): LeadConversionKind {
  if (!linked) return LeadConversionKind.NEW_STUDENT;
  const studying =
    studentActive &&
    enrollments.some((e) => {
      if (!e.groupActive) return false;
      const log = [...e.log];
      supplyOpeningRow(log, e.createdAt);
      return enrollmentStatusOn(log, at, e) === 'ACTIVE';
    });
  return studying
    ? LeadConversionKind.ALREADY_STUDYING
    : LeadConversionKind.RETURNING;
}

/**
 * `settleKeptPromises` stamps `resolvedAt` inside the payment's own
 * transaction, after the payment row (the transaction times out at 15 s), so
 * the payment that kept a promise was made at most this long before it.
 */
export const RESOLVE_WINDOW_MS = 60_000;

/** A payment of the student near a promise's `resolvedAt`, with the payment that corrected it. */
export interface WindowPayment {
  id: string;
  createdAt: Date;
  status: string;
  /** The re-post of an amount correction (`Payment.correctedBy`), if any. */
  correctedBy: { id: string; status: string } | null;
}

/**
 * The payment that made a promise KEPT before `resolvedPaymentId` existed:
 * the student's latest payment made in the 60 seconds up to `resolvedAt`
 * (`payments`: that student's COMPLETED and REVERSED payments, any status).
 * COMPLETED: it is the one. REVERSED by an amount correction: the re-post
 * stands in for it when COMPLETED, as the live code moves the promise's result
 * there (spec §7.3). Anything else (a plain reversal, nothing in the window):
 * null, and the promise earns nothing.
 */
export function resolvingPaymentId(
  resolvedAt: Date,
  payments: readonly WindowPayment[],
): string | null {
  const to = resolvedAt.getTime();
  const from = to - RESOLVE_WINDOW_MS;
  let best: WindowPayment | null = null;
  for (const p of payments) {
    const t = p.createdAt.getTime();
    if (t < from || t > to) continue;
    if (!best || t > best.createdAt.getTime()) best = p;
  }
  if (!best) return null;
  if (best.status === 'COMPLETED') return best.id;
  return best.correctedBy?.status === 'COMPLETED' ? best.correctedBy.id : null;
}
