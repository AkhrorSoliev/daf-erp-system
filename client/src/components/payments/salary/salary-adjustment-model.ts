import { formatPrice } from "@/lib/format-utils";
import { instantDate } from "../debt/debt-format";
import type { StaffAdjustment, StaffRow } from "./salary-types";

// The words and rules of the staff pay correction (ADR-0112). The figures are
// the server's; this file only picks the wording and the form's checks.

export const REASON_MIN = 3;
export const REASON_MAX = 300;

export interface AdjustmentFacts {
  manual: boolean;
  /** What the prorated formula gives. */
  formula: number;
  /** What the person is owed for the month before advances. */
  current: number;
}

export function adjustmentFacts(row: Pick<StaffRow, "monthly" | "calculated" | "adjustment">): AdjustmentFacts {
  return { manual: !!row.adjustment, formula: row.calculated ?? row.monthly, current: row.monthly };
}

/** The dialog's live line under the amount. */
export function diffText(amount: number, formula: number): string {
  const d = amount - formula;
  if (d === 0) return "Hisobdan farq yo'q";
  return `Hisobdan farq: ${d > 0 ? "+" : "−"}${formatPrice(Math.abs(d))} so'm`;
}

export function adjustmentMeta(a: StaffAdjustment): string {
  const who = a.by ? `${a.by.firstName} ${a.by.lastName}`.trim() : "Tizim";
  return `${who} · ${instantDate(a.at)}`;
}

/** The first thing wrong with the form, or null. */
export function adjustmentError(amount: number | null, reason: string): string | null {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return "Summani kiriting";
  const r = reason.trim();
  if (r.length < REASON_MIN) return "Sababini yozing";
  if (r.length > REASON_MAX) return `Sabab ${REASON_MAX} belgidan oshmasin`;
  return null;
}

/** Why the button stays shut for this payment, or null when it may open. */
export function adjustLockReason(payment: { status: string } | null): string | null {
  if (!payment || payment.status === "CALCULATED" || payment.status === "CANCELLED") return null;
  return "Oylik tasdiqlangan — avval to'lovni bekor qilish kerak.";
}
