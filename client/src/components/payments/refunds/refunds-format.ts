import { formatNumber, formatPrice } from "@/lib/format-utils";
import { dayMonth, instantDayMonth } from "../debt/debt-format";
import type {
  AgeBucket, CashAccountOption, NoticeCell, PendingRefundRow, RefundableDrawer, RefundableTab, RefundHistoryRow, TransferState,
} from "./refunds-types";

export type Tone = "muted" | "amber" | "red";

export const TAB_LABEL: Record<RefundableTab, string> = { muzlatilgan: "Muzlatilganlar", guruhsiz: "Guruhsiz", ketgan: "Ketganlar" };
/** The kind in one word — the drawer's «Holat» and the tab tables' since-column head. */
export const KIND_WORD: Record<RefundableTab, string> = { muzlatilgan: "Muzlatilgan", guruhsiz: "Guruhsiz", ketgan: "Ketgan" };
/** The age chips (spec §3.4); «Hammasi» is the empty value. */
export const AGE_LABEL: Record<AgeBucket, string> = { upto30: "30 kungacha", d31to60: "31–60 kun", over60: "60 kundan ko'p" };
/** The frozen tab's «Holat»: the same buckets as the chips. */
export const AGE_STATE: Record<AgeBucket, { text: string; tone: Tone }> = {
  upto30: { text: "kutilmoqda", tone: "muted" },
  d31to60: { text: "muddati o'tgan", tone: "amber" },
  over60: { text: "ketgan hisoblanadi", tone: "red" },
};
export const ACCOUNT_TYPE_LABEL: Record<CashAccountOption["type"], string> = { CASH: "Naqd", BANK: "Bank", CARD: "Karta" };

/** The line under the tab buttons — the mock-up's texts. */
export const TAB_RULE: Record<RefundableTab, string> = {
  muzlatilgan: "Muzlatilgan o'quvchilarning puli kelishilgan qaytish sanasigacha hisobida turadi. 30 kundan oshgani — shartnoma muddati o'tgan; 60 kundan oshgani tizimda ketgan hisoblanadi.",
  guruhsiz: "Statusi faol, lekin hech qaysi guruhda o'qimayotganlar. Guruhga qo'shilsa, pul oylik hisobiga o'tadi.",
  ketgan: "Ketgan, lekin balansida puli qolganlar. Pul so'rov bilan qaytariladi yoki xabar berilgach, muddat o'tganda markaz hisobiga o'tadi.",
};

export const PENDING_RULE =
  "So'rov ochilgan kuni o'quvchi balansi 0 bo'ladi. Pul kassadan «Berildi» bosilganda chiqadi. Muddat — 10 bank kuni (shanba, yakshanba va bayramlar sanalmaydi).";

export const summaryLine = (count: number) => `${formatNumber(count)} kishi — muzlatilgan, guruhsiz yoki ketgan`;

/** A tab button's small line; `overThirty` = chips 31–60 + over 60. */
export function tabSubline(tab: RefundableTab, count: number, overThirty: number): string {
  const people = `${formatNumber(count)} kishi`;
  if (tab === "muzlatilgan") return `${people} · ${formatNumber(overThirty)} tasi 30 kundan oshgan`;
  return tab === "guruhsiz" ? `${people} · guruhga qo'shilmagan` : `${people} · pulini olib ketmagan`;
}

/** «dd.MM · N kun». */
export const sinceText = (since: string, days: number) => `${dayMonth(since)} · ${formatNumber(days)} kun`;

/** «Xabar»: the latest valid notice. */
export function noticeText(n: NoticeCell | null): string {
  if (!n) return "berilmagan";
  return `${dayMonth(n.date)} · ${n.channel === "BOT" ? "bot orqali" : "qo'ng'iroq qilib aytildi"}`;
}

/**
 * The pending «Holat» pill: amber from 2 bank days left. On the due day itself
 * (0 left, not yet overdue) «bugun oxirgi kun»; overdue with 0 bank days (the
 * weekend right after a Friday due day) prints no count.
 */
export function duePill(due: PendingRefundRow["due"]): { text: string; tone: Tone } {
  if (due.overdue) return { text: due.bankDays > 0 ? `muddati o'tdi · ${formatNumber(due.bankDays)} bank kuni` : "muddati o'tdi", tone: "red" };
  if (due.bankDays === 0) return { text: "bugun oxirgi kun", tone: "amber" };
  return { text: `${formatNumber(due.bankDays)} bank kuni qoldi`, tone: due.bankDays <= 2 ? "amber" : "muted" };
}

export const pendingSumLine = (sum: number, total: number) => `${formatPrice(sum)} so'm · ${formatNumber(total)} ta so'rov`;

export const pendingEmptyText = (lastHandedOverAt: string | null) =>
  `Hozir kutilayotgan pul qaytarish yo'q.${lastHandedOverAt ? ` Oxirgisi ${instantDayMonth(lastHandedOverAt)} da berilgan.` : ""}`;

/** «Qaysi kassadan»: the accounts of the request's branch, «Naqd — Asosiy kassa». */
export const accountOptions = (accounts: CashAccountOption[], branchId: number | null) =>
  accounts.filter((a) => a.branchId === branchId).map((a) => ({ value: a.id, label: `${ACCOUNT_TYPE_LABEL[a.type]} — ${a.name}` }));

export const cancelConsequence = (amount: number) =>
  `Pul hali berilmagan. Bekor qilinsa, ${formatPrice(amount)} so'm o'quvchi balansiga qaytadi, bekor qilingan darslar ham joyiga qaytadi.`;

/** The transfer condition (spec §5.2): the server's refusal while locked, the green line once open. */
export function transferLine(t: TransferState): { allowed: boolean; text: string } {
  if (!t.allowed) return { allowed: false, text: t.refusal ?? "" };
  if (!t.notice || !t.termEnds) return { allowed: true, text: "" };
  return { allowed: true, text: `Shart bajarilgan: xabar ${dayMonth(t.notice.date)}, muddat ${dayMonth(t.termEnds)} da tugagan, 30 kun o'tdi.` };
}

/** The drawer's «Holat»: «Muzlatilgan · 15.09 · 25 kun»; «o'qiyapti» when the student studies again. */
export function drawerKindLine(d: Pick<RefundableDrawer, "kind" | "since" | "days">): string {
  if (!d.kind) return "o'qiyapti";
  return d.since && d.days !== null ? `${KIND_WORD[d.kind]} · ${sinceText(d.since, d.days)}` : KIND_WORD[d.kind];
}

/** The refund dialog's line (spec §4), from the preview's `dueDate`. */
export const requestDueLine = (dueDate: string) =>
  `So'rov ochilgach balans 0 bo'ladi. Pul ${dayMonth(dueDate)} gacha berilishi kerak (10 bank kuni). Kassadan pul «Berildi» bosilganda chiqadi.`;

/** The success toast (spec §4), from the answer's `dueDate`. */
export const requestOpenedText = (dueDate: string | null) =>
  dueDate ? `So'rov ochildi — pul ${dayMonth(dueDate)} gacha beriladi` : "So'rov ochildi";

/** History «Berildi»: «dd.MM · naqd|karta», or the «bekor qilindi» pill with the reason. */
export function handedCell(r: Pick<RefundHistoryRow, "status" | "handedOverAt" | "refundMethod" | "cancelReason">):
  { cancelled: true; reason: string | null } | { cancelled: false; text: string } {
  if (r.status === "REJECTED") return { cancelled: true, reason: r.cancelReason };
  if (!r.handedOverAt) return { cancelled: false, text: "—" };
  const day = instantDayMonth(r.handedOverAt);
  if (!r.refundMethod) return { cancelled: false, text: day };
  return { cancelled: false, text: `${day} · ${r.refundMethod === "CASH" ? "naqd" : "karta"}` };
}
