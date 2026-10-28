import { interpolate } from "@/i18n/translate";
import { addMonths } from "@/components/payments/salary-utils";
import { clampMonth } from "@/components/payments/overview/overview-math";
import type { Translate } from "@/components/payments/record-payment-admission";
import type { BankFeesBody, MonthCloseView } from "./month-close-types";

export interface PictureRow {
  label: string;
  amount: number;
}

/** «{Oy} surati»: the server's figures as one list, money going out is negative. */
export function pictureRows(v: MonthCloseView, t: Translate = interpolate): PictureRow[] {
  const n = v.netProfit;
  const rows: PictureRow[] = [{ label: t("Tushum"), amount: n.revenue }];
  if (n.balanceWithdrawals > 0) rows.push({ label: t("Yechib olingan balans"), amount: n.balanceWithdrawals });
  rows.push(
    { label: t("O'qituvchilar oyligi"), amount: -n.teacherSalary },
    { label: t("Xodimlar oyligi"), amount: -n.adminSalary },
    { label: t("Xarajatlar (bank xizmati bilan)"), amount: -n.operatingExpenses },
  );
  if (n.refunds > 0) rows.push({ label: t("Qaytarilgan pul"), amount: -n.refunds });
  rows.push(
    { label: t("To'lov komissiyasi"), amount: -n.taxes.providerFees },
    { label: t("Aylanma solig'i"), amount: -n.taxes.turnoverTax },
    { label: t("Korxona ijtimoiy solig'i"), amount: -n.taxes.employerSocialTax },
    { label: t("Sof foyda"), amount: n.netProfit },
  );
  return rows;
}

export interface ChecklistRow {
  ok: boolean;
  text: string;
}

/** «Tekshiruv»: one line per thing a person must finish before the month is closed. */
export function checklistRows(v: MonthCloseView, t: Translate = interpolate): ChecklistRow[] {
  const entered = v.bankAccounts.filter((a) => a.amount !== null).length;
  return [
    {
      ok: v.checklist.bankFeesEntered,
      text:
        v.bankAccounts.length === 0
          ? t("Bank xarajati: bank hisobi yo'q")
          : t("Bank xarajati: {total} ta hisobdan {entered} tasi kiritilgan", { total: v.bankAccounts.length, entered }),
    },
    {
      ok: v.checklist.salariesPaid,
      text: t("Oyliklar: {total} tadan {paid} tasi berilgan", { total: v.salaries.total, paid: v.salaries.paid }),
    },
    {
      ok: v.checklist.ratesComplete,
      text: v.checklist.ratesComplete ? t("Stavkalar to'liq") : t("Stavkalar to'liq emas — Sozlamalar → Soliq va komissiyalar"),
    },
  ];
}

/** The save body: only the accounts the person typed into, as whole so'm. */
export function bankFeeBody(accounts: MonthCloseView["bankAccounts"], drafts: Record<string, string>): BankFeesBody {
  return {
    items: accounts
      .filter((a) => (drafts[a.id] ?? "") !== "")
      .map((a) => ({ cashAccountId: a.id, amount: Number(drafts[a.id]) })),
  };
}

/** The first month the page offers: the server's `MONTH_CLOSE_FIRST_MONTH` (ADR-0139); earlier months were settled under the old rules. */
export const MONTH_CLOSE_FIRST_MONTH = "2026-10";

/** The page's month: `?oy=` kept in [2026-10, current]; empty or unreadable is the month a person closes now — the previous one. */
export function closeMonth(oy: string, current: string): string {
  const previous = addMonths(current, -1);
  const fallback = previous < MONTH_CLOSE_FIRST_MONTH ? MONTH_CLOSE_FIRST_MONTH : previous;
  return clampMonth(/^\d{4}-\d{2}$/.test(oy) ? oy : fallback, MONTH_CLOSE_FIRST_MONTH, current);
}
