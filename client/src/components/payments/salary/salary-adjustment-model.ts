import { interpolate, type Params } from "@/i18n/translate";
import { formatPrice } from "@/lib/format-utils";
import { instantDate } from "../debt/debt-format";
import type { StaffAdjustment, StaffRow } from "./salary-types";

// The words and rules of the staff pay correction (ADR-0112). The figures are
// the server's; this file only picks the wording and the form's checks.
// The helpers take the page's `t` as an optional last argument; without it they
// read the Uzbek source (placeholders filled).

type Translate = (source: string, params?: Params) => string;
const uzbek: Translate = interpolate;

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
export function diffText(amount: number, formula: number, t: Translate = uzbek): string {
  const d = amount - formula;
  if (d === 0) return t("Hisobdan farq yo'q");
  const diff = `${d > 0 ? "+" : "−"}${formatPrice(Math.abs(d))} ${t("so'm")}`;
  return t("Hisobdan farq: {diff}", { diff });
}

export function adjustmentMeta(a: StaffAdjustment, t: Translate = uzbek): string {
  // «Tizim» alone is the colour mode key; the system as an author reads «Tizim (avtomatik)».
  const who = a.by ? `${a.by.firstName} ${a.by.lastName}`.trim() : t("Tizim (avtomatik)");
  return `${who} · ${instantDate(a.at)}`;
}

/**
 * The first thing wrong with the form, or null. The dialog only uses it to keep
 * «Saqlash» shut; the text is never drawn, so it stays Uzbek.
 */
export function adjustmentError(amount: number | null, reason: string): string | null {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return "Summani kiriting";
  const r = reason.trim();
  if (r.length < REASON_MIN) return "Sababini yozing";
  if (r.length > REASON_MAX) return `Sabab ${REASON_MAX} belgidan oshmasin`;
  return null;
}

/** Why the button stays shut for this payment, or null when it may open. */
export function adjustLockReason(payment: { status: string } | null, t: Translate = uzbek): string | null {
  if (!payment || payment.status === "CALCULATED" || payment.status === "CANCELLED") return null;
  return t("Oylik tasdiqlangan — avval to'lovni bekor qilish kerak.");
}
