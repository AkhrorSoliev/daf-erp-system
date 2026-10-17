import { formatPrice } from "@/lib/format-utils";
import { monthShort } from "@/components/payments/salary-utils";
import type { PeriodId } from "./payments-url";
import type { PaymentListResponse, PaymentRow } from "./payments-list-types";

/** «Tanlangan: N ta to'lov · X so'm» and the optional «shundan {qism}: Y so'm» (spec B4 §3.6). */
export function selectedLine(
  totals: PaymentListResponse["totals"],
  holat: string,
  partLabel: string | null,
): { main: string; part: string | null } {
  const main =
    holat === "bekor"
      ? `Tanlangan: ${totals.count} ta bekor qilingan to'lov · summaga qo'shilmaydi`
      : `Tanlangan: ${totals.count} ta to'lov · ${formatPrice(totals.amount)} so'm`;
  const part = holat !== "bekor" && partLabel && totals.partAmount != null ? `shundan ${partLabel}: ${formatPrice(totals.partAmount)} so'm` : null;
  return { main, part };
}

/** The system receipt code and the paper number (spec B4 §4.7). */
export function receiptText(row: Pick<PaymentRow, "receiptCode" | "receiptNumber">): string {
  const paper = row.receiptNumber ? `qog'oz № ${row.receiptNumber}` : null;
  if (row.receiptCode) return paper ? `${row.receiptCode} · ${paper}` : row.receiptCode;
  return paper ? `— · ${paper}` : "—";
}

/** «Qabul qildi»: Onlayn, «Ism (admin)», «Ism» or a dash (spec B4 §3.7). */
export function receivedByText(row: Pick<PaymentRow, "online" | "receivedBy">): string {
  if (row.online) return "Onlayn";
  const by = row.receivedBy;
  if (!by) return "—";
  return by.roleLabel ? `${by.firstName} (${by.roleLabel})` : by.firstName;
}

/** The summary card's title for the period (spec B4 §3.4); `startDate` names the month. */
export function periodTitle(davr: PeriodId, startDate: string): string {
  switch (davr) {
    case "bugun": return "Bugun tushgan pul";
    case "kecha": return "Kecha tushgan pul";
    case "hafta": return "Shu hafta tushgan pul";
    case "oraliq": return "Tanlangan oraliqda tushgan pul";
    default: return `${monthShort(startDate.slice(0, 7))}da tushgan pul`;
  }
}

/** «Nimaga ketdi» filter options: the URL value → the server's part and the option's name (spec B4 §3.5). */
export const PART_FILTER: Record<"joriy" | "oldindan" | "qarz", { kind: "CURRENT" | "ADVANCE" | "LATE"; label: string }> = {
  joriy: { kind: "CURRENT", label: "Shu oy to'lovi" },
  oldindan: { kind: "ADVANCE", label: "Oldindan" },
  qarz: { kind: "LATE", label: "Eski qarz" },
};

export const METHOD_FILTER: { value: string; label: string }[] = [
  { value: "CASH", label: "Naqd" },
  { value: "CLICK", label: "Click" },
  { value: "PAYME", label: "Payme" },
  { value: "TRANSFER", label: "O'tkazma" },
  { value: "UZUM", label: "Uzum" },
];
