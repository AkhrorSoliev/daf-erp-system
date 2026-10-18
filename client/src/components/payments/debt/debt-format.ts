import { CALL_OUTCOME_INFO } from "@/components/outreach/outreach-types";
import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import type { Translate } from "../record-payment-admission";
import { tashkentNow } from "@/lib/tashkent-time";
import { monthShort } from "../salary-utils";
import type { DebtDrawer, DebtKind, DebtListItem, DebtTab, PromiseCell, TabTotal } from "./debt-types";

export const TAB_LABEL: Record<DebtTab, string> = { "shu-oy": msg("Shu oy"), eski: msg("Eski qarz"), chiqqan: msg("O'qimayotganlar") };
export const KIND_LABEL: Record<DebtKind, string> = { ungrouped: msg("Guruhsiz"), frozen: msg("Muzlatilgan"), left: msg("Ketgan") };
/** The kind inside a line or a pill (lower case). */
export const KIND_PILL: Record<DebtKind, string> = { ungrouped: msg("guruhsiz"), frozen: msg("muzlatilgan"), left: msg("ketgan") };

/** 'YYYY-MM-DD' → 'dd.MM'. */
export const dayMonth = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
/** An instant → its Tashkent 'dd.MM' / 'dd.MM.yyyy'. */
export const instantDayMonth = (iso: string) => dayMonth(tashkentNow(new Date(iso)).dateStr);
export const instantDate = (iso: string) => {
  const d = tashkentNow(new Date(iso)).dateStr;
  return `${dayMonth(d)}.${d.slice(0, 4)}`;
};
/** An instant → its Tashkent 'dd.MM.yyyy, HH:mm'. */
export const instantDateTime = (iso: string) => {
  const { minutes } = tashkentNow(new Date(iso));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${instantDate(iso)}, ${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
};

/** The line under the tab buttons — the mock-up's `rule` texts (spec §2.2). */
export function tabRule(tab: DebtTab, monthKey: string, t: Translate = interpolate): string {
  if (tab === "shu-oy") {
    return t("{month} to'lovini hali to'liq to'lamagan o'qiyotgan o'quvchilar. To'lov muddati — shartnoma bo'yicha oyning 2-darsigacha.", { month: monthShort(monthKey, t) });
  }
  if (tab === "eski") return t("O'qiyotgan, lekin o'tgan oylardan qarzi qolgan o'quvchilar. Shartnomaga ko'ra 2-darsga kirish uchun eski qarz ham to'lanishi kerak.");
  return t("Hozir hech qaysi guruhda o'qimayotganlar: guruhsiz qolgan, muzlatilgan yoki ketgan. Bu — undirish ro'yxati: qo'ng'iroq, va'da, to'lov.");
}

/** A month name inside a sentence: lower case unless the language keeps it capital (`keepsMonthCapital`). */
const inSentence = (monthKey: string, t: Translate, lower: boolean) => {
  const name = monthShort(monthKey, t);
  return lower ? name.toLowerCase() : name;
};

/** The small line of a tab button. */
export function tabSubline(tab: DebtTab, count: number, monthKey: string, t: Translate = interpolate, lower = true): string {
  const n = formatNumber(count);
  if (tab === "shu-oy") return t("{n} o'quvchi · {month} to'lovi", { n, month: inSentence(monthKey, t, lower) });
  if (tab === "eski") return t("{n} o'quvchi · o'tgan oylardan", { n });
  return t("{n} kishi · undirish ishi", { n });
}

/** «To'lov muddati» (spec §2.3); null prints «—». */
export function dueCell(due: string | null, today: string, t: Translate = interpolate): { text: string; overdue: boolean } | null {
  if (!due) return null;
  const date = dayMonth(due);
  return due <= today ? { text: t("o'tgan · {date}", { date }), overdue: true } : { text: t("{date} gacha", { date }), overdue: false };
}

export const promiseText = (p: PromiseCell, t: Translate = interpolate) => {
  const date = dayMonth(p.promiseDate);
  return p.state === "open" ? t("{date} gacha", { date }) : t("buzildi · {date}", { date });
};

/** The drawer's promise card: its title and «X so'm · dd.MM gacha» («… gacha edi» once broken). */
export const promiseCard = (p: PromiseCell, t: Translate = interpolate) => {
  const date = dayMonth(p.promiseDate);
  const day = p.state === "broken" ? t("{date} gacha edi", { date }) : t("{date} gacha", { date });
  return {
    title: p.state === "open" ? t("Va'da berilgan") : t("Va'da buzildi"),
    detail: p.promisedAmount != null ? `${formatPrice(p.promisedAmount)} ${t("so'm")} · ${day}` : day,
  };
};

export const lastCallText = (c: DebtListItem["lastCall"], t: Translate = interpolate) => {
  if (!c) return null;
  const outcome = CALL_OUTCOME_INFO[c.outcome];
  return `${instantDayMonth(c.createdAt)} · ${t(outcome.label)}`;
};

/** «Topildi: N ta · X so'm» with a filter, «Jami: X so'm · N ta» (the tab's total) without. */
export const sumLine = (filtered: boolean, total: number, sum: number, tab: TabTotal, t: Translate = interpolate) =>
  filtered
    ? t("Topildi: {n} ta · {amount} so'm", { n: formatNumber(total), amount: formatPrice(sum) })
    : t("Jami: {amount} so'm · {n} ta", { amount: formatPrice(tab.total), n: formatNumber(tab.count) });

/** The drawer header's «ID · holat»: a debtor without a kind is in a group. A `msg()` text: draw it with `t()`. */
export const drawerStatus = (kind: DebtKind | null) => (kind ? KIND_PILL[kind] : msg("o'qiyapti"));

/** The line under the drawer's total: how many months the debt spans and the oldest. Null without month lines. */
export function debtSpan(months: DebtDrawer["months"], t: Translate = interpolate, lower = true): string | null {
  const keys = months.flatMap((m) => (m.month && m.left > 0 ? [m.month] : [])).sort();
  if (keys.length === 0) return null;
  const oldest = inSentence(keys[0], t, lower);
  return keys.length === 1 ? t("{month} oyi uchun", { month: oldest }) : t("{n} oy bo'yicha · eng eskisi {month}", { n: keys.length, month: oldest });
}
