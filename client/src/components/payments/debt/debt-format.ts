import { CALL_OUTCOME_INFO } from "@/components/outreach/outreach-types";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { tashkentNow } from "@/lib/tashkent-time";
import { monthShort } from "../salary-utils";
import type { DebtDrawer, DebtKind, DebtListItem, DebtTab, PromiseCell, TabTotal } from "./debt-types";

export const TAB_LABEL: Record<DebtTab, string> = { "shu-oy": "Shu oy", eski: "Eski qarz", chiqqan: "O'qimayotganlar" };
export const KIND_LABEL: Record<DebtKind, string> = { ungrouped: "Guruhsiz", frozen: "Muzlatilgan", left: "Ketgan" };

/** 'YYYY-MM-DD' → 'dd.MM'. */
export const dayMonth = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
/** An instant → its Tashkent 'dd.MM' / 'dd.MM.yyyy'. */
export const instantDayMonth = (iso: string) => dayMonth(tashkentNow(new Date(iso)).dateStr);
export const instantDate = (iso: string) => {
  const d = tashkentNow(new Date(iso)).dateStr;
  return `${dayMonth(d)}.${d.slice(0, 4)}`;
};

/** The line under the tab buttons — the mock-up's `rule` texts (spec §2.2). */
export function tabRule(tab: DebtTab, monthKey: string): string {
  if (tab === "shu-oy") {
    return `${monthShort(monthKey)} to'lovini hali to'liq to'lamagan o'qiyotgan o'quvchilar. To'lov muddati — shartnoma bo'yicha oyning 2-darsigacha. Qatorni bosing: oylar bo'yicha qarz, aloqa tarixi va amallar ochiladi.`;
  }
  if (tab === "eski") return "O'qiyotgan, lekin o'tgan oylardan qarzi qolgan o'quvchilar. Shartnomaga ko'ra 2-darsga kirish uchun eski qarz ham to'lanishi kerak.";
  return "Hozir hech qaysi guruhda o'qimayotganlar: guruhsiz qolgan, muzlatilgan yoki ketgan. Bu — undirish ro'yxati: qo'ng'iroq, va'da, to'lov.";
}

/** The small line of a tab button. */
export function tabSubline(tab: DebtTab, count: number, monthKey: string): string {
  if (tab === "shu-oy") return `${formatNumber(count)} o'quvchi · ${monthShort(monthKey).toLowerCase()} to'lovi`;
  if (tab === "eski") return `${formatNumber(count)} o'quvchi · o'tgan oylardan`;
  return `${formatNumber(count)} kishi · undirish ishi`;
}

/** «To'lov muddati» (spec §2.3); null prints «—». */
export function dueCell(due: string | null, today: string): { text: string; overdue: boolean } | null {
  if (!due) return null;
  return due <= today ? { text: `o'tgan · ${dayMonth(due)}`, overdue: true } : { text: `${dayMonth(due)} gacha`, overdue: false };
}

export const promiseText = (p: PromiseCell) => (p.state === "open" ? `${dayMonth(p.promiseDate)} gacha` : `buzildi · ${dayMonth(p.promiseDate)}`);

/** The drawer's «Va'da: X so'm, dd.MM gacha». */
export const promiseLine = (p: PromiseCell) =>
  p.promisedAmount != null
    ? `Va'da: ${formatPrice(p.promisedAmount)} so'm, ${dayMonth(p.promiseDate)} gacha`
    : `Va'da: ${dayMonth(p.promiseDate)} gacha`;

export const lastCallText = (c: DebtListItem["lastCall"]) => (c ? `${instantDayMonth(c.createdAt)} · ${CALL_OUTCOME_INFO[c.outcome].label}` : null);

/** «Topildi: N ta · X so'm» with a filter, «Jami: X so'm · N ta» (the tab's total) without. */
export const sumLine = (filtered: boolean, total: number, sum: number, tab: TabTotal) =>
  filtered ? `Topildi: ${formatNumber(total)} ta · ${formatPrice(sum)} so'm` : `Jami: ${formatPrice(tab.total)} so'm · ${formatNumber(tab.count)} ta`;

/** One drawer month line; a non-month line (a mock fee, a refund paid out) has only `left`. */
export const drawerMonthText = (m: Pick<DebtDrawer["months"][number], "month" | "charged" | "paid" | "left">) =>
  m.charged === null
    ? `qoldi ${formatPrice(m.left)}`
    : `hisoblandi ${formatPrice(m.charged)} · to'landi ${formatPrice(m.paid ?? 0)} · qoldi ${formatPrice(m.left)}`;
