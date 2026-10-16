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
}

/**
 * The kind of a lead converted before stage 2 shipped. A lead not linked to
 * an existing card opened a new student. A linked lead brought back a
 * student who was not studying at the conversion (RETURNING), or earned
 * nothing (ALREADY_STUDYING). "Studying" is an enrollment ACTIVE at that
 * moment, read by `enrollmentStatusOn`.
 */
export function restoredConversionKind(
  linked: boolean,
  enrollments: readonly EnrollmentAtConversion[],
  at: Date,
): LeadConversionKind {
  if (!linked) return LeadConversionKind.NEW_STUDENT;
  const studying = enrollments.some((e) => {
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

/**
 * The payment that made a promise KEPT before `resolvedPaymentId` existed:
 * the student's latest COMPLETED payment made in the 60 seconds up to
 * `resolvedAt` (`payments` are that student's COMPLETED payments). None in
 * the window — null, and the promise earns nothing (a payment since reversed
 * is not COMPLETED, so its promise earns nothing either, as live).
 */
export function resolvingPaymentId(
  resolvedAt: Date,
  payments: readonly { id: string; createdAt: Date }[],
): string | null {
  const to = resolvedAt.getTime();
  const from = to - RESOLVE_WINDOW_MS;
  let best: { id: string; createdAt: Date } | null = null;
  for (const p of payments) {
    const t = p.createdAt.getTime();
    if (t < from || t > to) continue;
    if (!best || t > best.createdAt.getTime()) best = p;
  }
  return best?.id ?? null;
}
