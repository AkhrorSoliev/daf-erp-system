import { formatPrice } from "@/lib/format-utils";

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

export const MONTHLY_PAYMENT_EXPLANATION =
  "To'lov balansga tushadi: avval qarz yopiladi, qolgani keyingi oy to'lovi uchun balansda qoladi.";

/** `null` means nothing student-specific to offer; the dialog shows its fixed grid. */
export function buildQuickAmounts(preview: QuickAmountSource): QuickAmount[] | null {
  if (preview.model === "MONTHLY") {
    return preview.monthly ? monthlyQuickAmounts(preview.monthly) : null;
  }
  return preview.primaryEnrollment
    ? lessonPackQuickAmounts(preview.primaryEnrollment, preview.currentBalance)
    : null;
}

function monthlyQuickAmounts({ debt, nextMonthAmount }: MonthlyPreviewBlock): QuickAmount[] | null {
  const items: QuickAmount[] = [];
  if (debt > 0) {
    // The debt already contains the current month's charge (billed on the
    // 1st), so closing it is the usual payment; "+ keyingi oy" is a prepayment.
    items.push({ key: "debt", amount: debt, label: "Qarzni yopish", recommended: true });
  }
  if (debt > 0 && nextMonthAmount > 0) {
    items.push({ key: "debt-next", amount: debt + nextMonthAmount, label: "Qarz + keyingi oy", recommended: false });
  }
  if (nextMonthAmount > 0) {
    items.push(
      { key: "month-1", amount: nextMonthAmount, label: "1 oy", recommended: debt <= 0 },
      { key: "month-2", amount: nextMonthAmount * 2, label: "2 oy", recommended: false },
    );
  }
  return items.length > 0 ? items : null;
}

// Unchanged cycle suggestions, moved out of the dialog.
function lessonPackQuickAmounts(
  enr: { fullCycleCost: number; lessonPaymentCount: number },
  currentBalance: number,
): QuickAmount[] {
  const debt = Math.max(0, -currentBalance);
  const n = enr.lessonPaymentCount;
  return [
    debt > 0
      ? { key: "recommended", amount: debt + enr.fullCycleCost, label: `Qarz + 1 sikl (${n} dars)`, recommended: true }
      : { key: "recommended", amount: enr.fullCycleCost, label: `1 to'liq sikl (${n} dars)`, recommended: true },
    { key: "cycle-1", amount: enr.fullCycleCost, label: `+1 sikl (${n} dars)`, recommended: false },
    { key: "cycle-2", amount: enr.fullCycleCost * 2, label: `+2 sikl (${n * 2} dars)`, recommended: false },
  ];
}

// An absent model means an older server, which only ever meant LESSON_PACK —
// so undefined must keep the lesson-pack wording, same as "LESSON_PACK" itself.
// Only an explicit "MONTHLY" drops the cycle-price suffix.
export function suggestedAmountHint(amount: number, model: PaymentPreviewModel | undefined): string {
  const base = `Tavsiya: ${formatPrice(amount)} so'm`;
  return model !== "MONTHLY" ? `${base} — kurs to'liq tsikl narxi` : base;
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
): string {
  if (!preview) return `Tavsiya: ${formatPrice(amount)} so'm`;
  return suggestedAmountHint(amount, preview.model);
}

export function monthlyEnrollmentLine(e: MonthlyPreviewEnrollment): string {
  const head = `${e.groupName} · ${e.courseName} · oyiga ${formatPrice(e.amount)} so'm`;
  return e.amount === e.monthlyPrice ? head : `${head} (chegirmasiz ${formatPrice(e.monthlyPrice)})`;
}

export function monthlySummaryLine(m: MonthlyPreviewBlock): string | null {
  const parts: string[] = [];
  if (m.debt > 0) parts.push(`Qarz: ${formatPrice(m.debt)} so'm`);
  if (m.nextMonthAmount > 0) parts.push(`Keyingi oy: ${formatPrice(m.nextMonthAmount)} so'm`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
