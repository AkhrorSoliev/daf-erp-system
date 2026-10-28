import { formatBalance } from "@/lib/format-utils";
import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import type { Translate } from "@/components/payments/record-payment-admission";
import type { ProfitComposition } from "./types";

/** Nothing is reported before this month (the company's first month in the system). */
export const REPORT_FLOOR_MONTH = "2026-05";
/** Monthly billing starts here (server `MONTHLY_BILLING_START_MONTH`, ADR-0058). */
export const MONTHLY_BILLING_START_MONTH = "2026-09";
/** Teacher pay is the full deserved figure from here (server `TOPUP_EFFECTIVE_MONTH`). */
export const FULL_TEACHER_PAY_MONTH = "2026-07";

export function isMonthlyBillingMonth(month: string): boolean {
  return month >= MONTHLY_BILLING_START_MONTH;
}

/** A `YYYY-MM` from the URL kept inside [min, max]; anything unreadable is `max`. */
export function clampMonth(raw: string, min: string, max: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return max;
  if (raw < min) return min;
  return raw > max ? max : raw;
}

/** The month as the period the server reads: its first and last day. */
export function monthRange(month: string): { startDate: string; endDate: string } {
  const [y, m] = month.split("-").map(Number);
  // Day 0 of the next month is this month's last day — calendar arithmetic, no clock.
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** "2026-10-14" → "14.10". */
export function dayMonth(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

/** "1 500 000 so'm"; a missing figure is «—». A negated 0 (`-0`) prints «0 so'm», never «-0». `t` translates the unit. */
export function som(amount: number | null | undefined, t?: Translate): string {
  return amount == null ? "—" : formatBalance(amount, t ? t("so'm") : "so'm");
}

/** A payment method's name, never the stored value. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: msg("Naqd"),
  PAYME: msg("Payme"),
  CLICK: msg("Click"),
  UZUM: msg("Uzum"),
  TRANSFER: msg("O'tkazma"),
  QR: msg("QR-kod"),
};

/** The method's name in the page language; an unknown code prints as it is. */
export function paymentMethodLabel(method: string, t: Translate = interpolate): string {
  const label = PAYMENT_METHOD_LABELS[method];
  return label ? t(label) : method;
}

export interface ProfitLine {
  label: string;
  amount: number;
}

/**
 * «Qanday hisoblandi» as one equation, in order: signed lines that add up to
 * the composition's `netProfit` (the server builds the figure from the same
 * legs). Withdrawals, refunds and each tax line appear only when they are not 0.
 */
export function profitLines(
  c: Pick<ProfitComposition, "revenue" | "withdrawals" | "teachers" | "staff" | "expenses" | "refunds" | "taxes">,
  t: Translate = interpolate,
): ProfitLine[] {
  const withdrawn = c.withdrawals?.total ?? 0;
  return [
    { label: t("O'tilgan darslar puli"), amount: c.revenue.total },
    ...(withdrawn !== 0 ? [{ label: t("Balansdan yechib olingan"), amount: withdrawn }] : []),
    { label: t("Ustozlar oyligi"), amount: -c.teachers.total },
    { label: t("Xodimlar oyligi"), amount: -c.staff.total },
    { label: t("Boshqa xarajatlar"), amount: -c.expenses.total },
    ...(c.refunds !== 0 ? [{ label: t("Qaytarilgan pul"), amount: -c.refunds }] : []),
    ...((c.taxes?.providerFees ?? 0) !== 0 ? [{ label: t("To'lov komissiyasi"), amount: -(c.taxes?.providerFees ?? 0) }] : []),
    ...((c.taxes?.employerSocialTax ?? 0) !== 0 ? [{ label: t("Ijtimoiy soliq"), amount: -(c.taxes?.employerSocialTax ?? 0) }] : []),
    ...((c.taxes?.turnoverTax ?? 0) !== 0 ? [{ label: t("Aylanma solig'i"), amount: -(c.taxes?.turnoverTax ?? 0) }] : []),
  ];
}

/** The server's key for «no bank fee entered for the month» (not a rate; `tax-costs.ts`). */
export const BANK_FEES_ENTERED_KEY = "bank.feesEntered";

export interface MissingRatesNote {
  text: string;
  /** What to open: the rates page when a rate is missing, «Oyni yopish» when the bank fee is. */
  links: { href: string; label: string }[];
}

/** The amber warning under the profit lines; the wording follows what is missing (spec 2026-10-28). */
export function missingRatesNote(missing: string[], t: Translate = interpolate): MissingRatesNote | null {
  const n = missing.filter((k) => k !== BANK_FEES_ENTERED_KEY).length;
  const bank = n < missing.length;
  if (n === 0 && !bank) return null;
  const rates = { href: "/settings/tax", label: t("Stavkalarni kiritish →") };
  const close = { href: "/reports/oyni-yopish", label: t("Oyni yopish →") };
  if (!bank) return { text: t("Hisob to'liq emas: {n} ta stavka kiritilmagan", { n }), links: [rates] };
  if (n === 0) return { text: t("Bank xarajati kiritilmagan"), links: [close] };
  return { text: t("Hisob to'liq emas: {n} ta stavka va bank xarajati kiritilmagan", { n }), links: [rates, close] };
}
