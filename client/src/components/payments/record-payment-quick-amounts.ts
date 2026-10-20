import { interpolate } from "@/i18n/translate";
import { msg } from "@/i18n/msg";
import { formatPrice } from "@/lib/format-utils";
import type { PaymentReach, Translate } from "./record-payment-admission";

export type PaymentPreviewModel = "MONTHLY" | "LESSON_PACK";

export interface MonthlyPreviewEnrollment {
  groupName: string;
  courseName: string;
  monthlyPrice: number;
  amount: number;
}

export interface MonthlyPreviewBlock {
  debt: number;
  nextMonthAmount: number;
  discountPercent: number;
  enrollments: MonthlyPreviewEnrollment[];
  // Contract 3.2 (ADR-0047): how far the balance after this payment reaches.
  // Absent on an older server, null before the rule starts.
  admission?: PaymentReach | null;
  // ADR-0064: what the least share of the month asks for before this payment,
  // while it keeps the student out of their next lesson. Absent on an older
  // server.
  minShareDue?: { amount: number; percent: number } | null;
}

/** The slice of GET /payments/preview the quick amounts are derived from. */
export interface QuickAmountSource {
  // Absent on a server older than the monthly preview: read as LESSON_PACK.
  model?: PaymentPreviewModel;
  currentBalance: number;
  primaryEnrollment: { fullCycleCost: number; lessonPaymentCount: number } | null;
  monthly?: MonthlyPreviewBlock | null;
}

export interface QuickAmount {
  key: string;
  amount: number;
  label: string;
  // Drawn with the sparkle icon: the amount the cashier most likely wants.
  recommended: boolean;
}

// Drawn with t(…) by the dialog.
export const MONTHLY_PAYMENT_EXPLANATION = msg(
  "To'lov balansga tushadi: avval qarz yopiladi, qolgani keyingi oy to'lovi uchun balansda qoladi.",
);

/** `null` means nothing student-specific to offer; the dialog shows its fixed grid. */
export function buildQuickAmounts(preview: QuickAmountSource, t: Translate = interpolate): QuickAmount[] | null {
  if (preview.model === "MONTHLY") {
    return preview.monthly ? monthlyQuickAmounts(preview.monthly, t) : null;
  }
  return preview.primaryEnrollment
    ? lessonPackQuickAmounts(preview.primaryEnrollment, preview.currentBalance, t)
    : null;
}

function monthlyQuickAmounts(
  { debt, nextMonthAmount, minShareDue }: MonthlyPreviewBlock,
  t: Translate,
): QuickAmount[] | null {
  const items: QuickAmount[] = [];
  if (debt > 0) {
    // The debt already contains the current month's charge (billed on the
    // 1st), so closing it is the usual payment; "+ keyingi oy" is a prepayment.
    items.push({ key: "debt", amount: debt, label: t("Qarzni yopish"), recommended: true });
  }
  if (minShareDue) {
    // The least that lets the student into their next lesson (ADR-0064),
    // rounded up to a whole 1 000 so'm so it is never one so'm short.
    const amount = Math.ceil(minShareDue.amount / 1000) * 1000;
    if (amount < debt) {
      items.push({ key: "min-share", amount, label: t("Kamida {percent}%", { percent: minShareDue.percent }), recommended: false });
    }
  }
  if (debt > 0 && nextMonthAmount > 0) {
    items.push({ key: "debt-next", amount: debt + nextMonthAmount, label: t("Qarz + keyingi oy"), recommended: false });
  }
  if (nextMonthAmount > 0) {
    items.push(
      { key: "month-1", amount: nextMonthAmount, label: t("1 oy"), recommended: debt <= 0 },
      { key: "month-2", amount: nextMonthAmount * 2, label: t("2 oy"), recommended: false },
    );
  }
  return items.length > 0 ? items : null;
}

// Unchanged cycle suggestions, moved out of the dialog.
function lessonPackQuickAmounts(
  enr: { fullCycleCost: number; lessonPaymentCount: number },
  currentBalance: number,
  t: Translate,
): QuickAmount[] {
  const debt = Math.max(0, -currentBalance);
  const n = enr.lessonPaymentCount;
  return [
    debt > 0
      ? { key: "recommended", amount: debt + enr.fullCycleCost, label: t("Qarz + 1 sikl ({n} dars)", { n }), recommended: true }
      : { key: "recommended", amount: enr.fullCycleCost, label: t("1 to'liq sikl ({n} dars)", { n }), recommended: true },
    { key: "cycle-1", amount: enr.fullCycleCost, label: t("+1 sikl ({n} dars)", { n }), recommended: false },
    { key: "cycle-2", amount: enr.fullCycleCost * 2, label: t("+2 sikl ({n} dars)", { n: n * 2 }), recommended: false },
  ];
}

// An absent model means an older server, which only ever meant LESSON_PACK —
// so undefined must keep the lesson-pack wording, same as "LESSON_PACK" itself.
// Only an explicit "MONTHLY" drops the cycle-price suffix.
export function suggestedAmountHint(
  amount: number,
  model: PaymentPreviewModel | undefined,
  t: Translate = interpolate,
): string {
  const params = { amount: formatPrice(amount) };
  return model !== "MONTHLY"
    ? t("Tavsiya: {amount} so'm — kurs to'liq tsikl narxi", params)
    : t("Tavsiya: {amount} so'm", params);
}

/**
 * Same wording rule as `suggestedAmountHint`, but for the dialog's raw
 * `/payments/preview` response instead of an already-unwrapped `model`.
 *
 * The two "no model" cases look identical at the call site (`preview?.model`
 * is `undefined` either way) but mean opposite things: no preview object at
 * all means the request is still loading or failed, so nothing is known yet
 * and the pack suffix must NOT show even for a monthly student — while a real
 * response that simply has no `model` field is the older-server case, which
 * keeps meaning LESSON_PACK. Distinguishing them needs the preview object
 * itself, not just its `model`.
 */
export function suggestedAmountHintForPreview(
  amount: number,
  preview: { model?: PaymentPreviewModel } | null | undefined,
  t: Translate = interpolate,
): string {
  if (!preview) return t("Tavsiya: {amount} so'm", { amount: formatPrice(amount) });
  return suggestedAmountHint(amount, preview.model, t);
}

export function monthlyEnrollmentLine(e: MonthlyPreviewEnrollment, t: Translate = interpolate): string {
  const params = { group: e.groupName, course: e.courseName, amount: formatPrice(e.amount), price: formatPrice(e.monthlyPrice) };
  return e.amount === e.monthlyPrice
    ? t("{group} · {course} · oyiga {amount} so'm", params)
    : t("{group} · {course} · oyiga {amount} so'm (chegirmasiz {price})", params);
}

export function monthlySummaryLine(m: MonthlyPreviewBlock, t: Translate = interpolate): string | null {
  const parts: string[] = [];
  if (m.debt > 0) parts.push(t("Qarz: {amount} so'm", { amount: formatPrice(m.debt) }));
  if (m.nextMonthAmount > 0) parts.push(t("Keyingi oy: {amount} so'm", { amount: formatPrice(m.nextMonthAmount) }));
  return parts.length > 0 ? parts.join(" · ") : null;
}
