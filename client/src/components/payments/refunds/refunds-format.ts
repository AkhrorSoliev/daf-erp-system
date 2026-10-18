import { formatNumber, formatPrice } from "@/lib/format-utils";
import { interpolate } from "@/i18n/translate";
import { msg } from "@/i18n/msg";
import type { Translate } from "../record-payment-admission";
import { dayMonth, instantDayMonth } from "../debt/debt-format";
import type {
  AgeBucket, CashAccountOption, NoticeCell, PendingRefundRow, RefundableDrawer, RefundableTab, RefundHistoryRow, TransferState,
} from "./refunds-types";

// The texts are `msg()` marks drawn with `t()` by the components; the sentence builders take an optional last `t`
// (default: the Uzbek text), so a caller without a language keeps the Uzbek output.

export type Tone = "muted" | "amber" | "red";

export const TAB_LABEL: Record<RefundableTab, string> = { muzlatilgan: msg("Muzlatilganlar"), guruhsiz: msg("Guruhsiz"), ketgan: msg("Ketganlar") };
/** The kind in one word — the drawer's «Holat» and the tab tables' since-column head. */
export const KIND_WORD: Record<RefundableTab, string> = { muzlatilgan: msg("Muzlatilgan"), guruhsiz: msg("Guruhsiz"), ketgan: msg("Ketgan") };
/** The age chips (spec §3.4); «Hammasi» is the empty value. */
export const AGE_LABEL: Record<AgeBucket, string> = { upto30: msg("30 kungacha"), d31to60: msg("31–60 kun"), over60: msg("60 kundan ko'p") };
/** The frozen tab's «Holat»: the same buckets as the chips. */
export const AGE_STATE: Record<AgeBucket, { text: string; tone: Tone }> = {
  upto30: { text: msg("kutilmoqda"), tone: "muted" },
  d31to60: { text: msg("muddati o'tgan"), tone: "amber" },
  over60: { text: msg("ketgan hisoblanadi"), tone: "red" },
};
export const ACCOUNT_TYPE_LABEL: Record<CashAccountOption["type"], string> = { CASH: msg("Naqd"), BANK: msg("Bank"), CARD: msg("Karta") };

/** The line under the tab buttons — the mock-up's texts. */
export const TAB_RULE: Record<RefundableTab, string> = {
  muzlatilgan: msg("Muzlatilgan o'quvchilarning puli kelishilgan qaytish sanasigacha hisobida turadi. 30 kundan oshgani — shartnoma muddati o'tgan; 60 kundan oshgani tizimda ketgan hisoblanadi."),
  guruhsiz: msg("Statusi faol, lekin hech qaysi guruhda o'qimayotganlar. Guruhga qo'shilsa, pul oylik hisobiga o'tadi."),
  ketgan: msg("Ketgan, lekin balansida puli qolganlar. Pul so'rov bilan qaytariladi yoki xabar berilgach, muddat o'tganda markaz hisobiga o'tadi."),
};

export const PENDING_RULE =
  msg("So'rov ochilgan kuni o'quvchi balansi 0 bo'ladi. Pul kassadan «Berildi» bosilganda chiqadi. Muddat — 10 bank kuni (shanba, yakshanba va bayramlar sanalmaydi).");

export const summaryLine = (count: number, t: Translate = interpolate) =>
  t("{n} kishi — muzlatilgan, guruhsiz yoki ketgan", { n: formatNumber(count) });

/** A tab button's small line; `overThirty` = chips 31–60 + over 60. */
export function tabSubline(tab: RefundableTab, count: number, overThirty: number, t: Translate = interpolate): string {
  const n = formatNumber(count);
  if (tab === "muzlatilgan") return t("{n} kishi · {over} tasi 30 kundan oshgan", { n, over: formatNumber(overThirty) });
  return tab === "guruhsiz" ? t("{n} kishi · guruhga qo'shilmagan", { n }) : t("{n} kishi · pulini olib ketmagan", { n });
}

/** «dd.MM · N kun». */
export const sinceText = (since: string, days: number, t: Translate = interpolate) =>
  t("{date} · {days} kun", { date: dayMonth(since), days: formatNumber(days) });

/** «Xabar»: the latest valid notice. */
export function noticeText(n: NoticeCell | null, t: Translate = interpolate): string {
  if (!n) return t("berilmagan");
  const date = dayMonth(n.date);
  return n.channel === "BOT" ? t("{date} · bot orqali", { date }) : t("{date} · qo'ng'iroq qilib aytildi", { date });
}

/**
 * The pending «Holat» pill: amber from 2 bank days left. On the due day itself
 * (0 left, not yet overdue) «bugun oxirgi kun»; overdue with 0 bank days (the
 * weekend right after a Friday due day) prints no count.
 */
export function duePill(due: PendingRefundRow["due"], t: Translate = interpolate): { text: string; tone: Tone } {
  if (due.overdue) {
    return { text: due.bankDays > 0 ? t("muddati o'tdi · {n} bank kuni", { n: formatNumber(due.bankDays) }) : t("muddati o'tdi"), tone: "red" };
  }
  if (due.bankDays === 0) return { text: t("bugun oxirgi kun"), tone: "amber" };
  return { text: t("{n} bank kuni qoldi", { n: formatNumber(due.bankDays) }), tone: due.bankDays <= 2 ? "amber" : "muted" };
}

export const pendingSumLine = (sum: number, total: number, t: Translate = interpolate) =>
  t("{sum} so'm · {total} ta so'rov", { sum: formatPrice(sum), total: formatNumber(total) });

export const pendingEmptyText = (lastHandedOverAt: string | null, t: Translate = interpolate) =>
  t("Hozir kutilayotgan pul qaytarish yo'q.") +
  (lastHandedOverAt ? ` ${t("Oxirgisi {date} da berilgan.", { date: instantDayMonth(lastHandedOverAt) })}` : "");

/** «Qaysi kassadan»: the accounts of the request's branch, «Naqd — Asosiy kassa». */
export const accountOptions = (accounts: CashAccountOption[], branchId: number | null, t: Translate = interpolate) =>
  accounts.filter((a) => a.branchId === branchId).map((a) => {
    const type = ACCOUNT_TYPE_LABEL[a.type];
    return { value: a.id, label: `${t(type)} — ${a.name}` };
  });

export const cancelConsequence = (amount: number, t: Translate = interpolate) =>
  t("Pul hali berilmagan. Bekor qilinsa, {amount} so'm o'quvchi balansiga qaytadi, bekor qilingan darslar ham joyiga qaytadi.", { amount: formatPrice(amount) });

/** The transfer condition (spec §5.2): the server's refusal while locked (never translated), the green line once open. */
export function transferLine(state: TransferState, t: Translate = interpolate): { allowed: boolean; text: string } {
  if (!state.allowed) return { allowed: false, text: state.refusal ?? "" };
  if (!state.notice || !state.termEnds) return { allowed: true, text: "" };
  return {
    allowed: true,
    text: t("Shart bajarilgan: xabar {notice}, muddat {term} da tugagan, 30 kun o'tdi.", { notice: dayMonth(state.notice.date), term: dayMonth(state.termEnds) }),
  };
}

/** The drawer's «Holat»: «Muzlatilgan · 15.09 · 25 kun»; «o'qiyapti» when the student studies again. */
export function drawerKindLine(d: Pick<RefundableDrawer, "kind" | "since" | "days">, t: Translate = interpolate): string {
  if (!d.kind) return t("o'qiyapti");
  const kind = KIND_WORD[d.kind];
  const word = t(kind);
  return d.since && d.days !== null ? `${word} · ${sinceText(d.since, d.days, t)}` : word;
}

/** The refund dialog's line (spec §4), from the preview's `dueDate`. */
export const requestDueLine = (dueDate: string, t: Translate = interpolate) =>
  t("So'rov ochilgach bu summa balansdan darhol ayiriladi. Pul {date} gacha berilishi kerak (10 bank kuni). Kassadan pul «Berildi» bosilganda chiqadi.", { date: dayMonth(dueDate) });

/** The success toast (spec §4), from the answer's `dueDate`. */
export const requestOpenedText = (dueDate: string | null, t: Translate = interpolate) =>
  dueDate ? t("So'rov ochildi — pul {date} gacha beriladi", { date: dayMonth(dueDate) }) : t("So'rov ochildi");

/** History «Berildi»: «dd.MM · naqd|karta», or the «bekor qilindi» pill with the reason. */
export function handedCell(r: Pick<RefundHistoryRow, "status" | "handedOverAt" | "refundMethod" | "cancelReason">, t: Translate = interpolate):
  { cancelled: true; reason: string | null } | { cancelled: false; text: string } {
  if (r.status === "REJECTED") return { cancelled: true, reason: r.cancelReason };
  if (!r.handedOverAt) return { cancelled: false, text: "—" };
  const day = instantDayMonth(r.handedOverAt);
  if (!r.refundMethod) return { cancelled: false, text: day };
  return { cancelled: false, text: `${day} · ${r.refundMethod === "CASH" ? t("naqd") : t("karta")}` };
}
