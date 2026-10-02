import { formatPrice } from "@/lib/format-utils";
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

/** "1 500 000 so'm"; a missing figure is «—». */
export function som(amount: number | null | undefined): string {
  return amount == null ? "—" : `${formatPrice(amount)} so'm`;
}

/** A payment method's name, never the stored value. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Naqd",
  PAYME: "Payme",
  CLICK: "Click",
  UZUM: "Uzum",
  TRANSFER: "O'tkazma",
};

export interface ProfitLine {
  label: string;
  amount: number;
}

/**
 * «Qanday hisoblandi» as one equation, in order: signed lines that add up to
 * the composition's `netProfit` (the server builds the figure from the same
 * legs). Withdrawals and refunds appear only when they are not 0.
 */
export function profitLines(
  c: Pick<ProfitComposition, "revenue" | "withdrawals" | "teachers" | "staff" | "expenses" | "refunds">,
): ProfitLine[] {
  const withdrawn = c.withdrawals?.total ?? 0;
  return [
    { label: "O'tilgan darslar puli", amount: c.revenue.total },
    ...(withdrawn !== 0 ? [{ label: "Balansdan yechib olingan", amount: withdrawn }] : []),
    { label: "Ustozlar oyligi", amount: -c.teachers.total },
    { label: "Xodimlar oyligi", amount: -c.staff.total },
    { label: "Boshqa xarajatlar", amount: -c.expenses.total },
    ...(c.refunds !== 0 ? [{ label: "Qaytarilgan pul", amount: -c.refunds }] : []),
  ];
}
