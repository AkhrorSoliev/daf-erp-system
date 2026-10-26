import { formatPrice } from "@/lib/format-utils";
import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import type { Translate } from "@/components/payments/record-payment-admission";
import { monthShort } from "@/components/payments/salary-utils";
import type { PeriodId } from "./payments-url";
import type { PaymentListResponse, PaymentRow } from "./payments-list-types";

/** «Tanlangan: N ta to'lov · X so'm» and the optional «shundan {qism}: Y so'm» (spec B4 §3.6). `partLabel` arrives already translated. */
export function selectedLine(
  totals: PaymentListResponse["totals"],
  holat: string,
  partLabel: string | null,
  t: Translate = interpolate,
): { main: string; part: string | null } {
  const main =
    holat === "bekor"
      ? t("Tanlangan: {n} ta bekor qilingan to'lov · summaga qo'shilmaydi", { n: totals.count })
      : t("Tanlangan: {n} ta to'lov · {amount} so'm", { n: totals.count, amount: formatPrice(totals.amount) });
  const part =
    holat !== "bekor" && partLabel && totals.partAmount != null
      ? t("shundan {part}: {amount} so'm", { part: partLabel, amount: formatPrice(totals.partAmount) })
      : null;
  return { main, part };
}

/** The system receipt code and the paper number (spec B4 §4.7). */
export function receiptText(row: Pick<PaymentRow, "receiptCode" | "receiptNumber">, t: Translate = interpolate): string {
  const paper = row.receiptNumber ? t("qog'oz № {number}", { number: row.receiptNumber }) : null;
  if (row.receiptCode) return paper ? `${row.receiptCode} · ${paper}` : row.receiptCode;
  return paper ? `— · ${paper}` : "—";
}

/** «Qabul qildi»: Onlayn, «Ism (admin)», «Ism» or a dash (spec B4 §3.7). The role label is the server's. */
export function receivedByText(row: Pick<PaymentRow, "online" | "receivedBy">, t: Translate = interpolate): string {
  if (row.online) return t("Onlayn");
  const by = row.receivedBy;
  if (!by) return "—";
  return by.roleLabel ? `${by.firstName} (${by.roleLabel})` : by.firstName;
}

/** The summary card's title for the period (spec B4 §3.4); `startDate` names the month. */
export function periodTitle(davr: PeriodId, startDate: string, t: Translate = interpolate): string {
  switch (davr) {
    case "bugun": return t("Bugun tushgan pul");
    case "kecha": return t("Kecha tushgan pul");
    case "hafta": return t("Shu hafta tushgan pul");
    case "oraliq": return t("Tanlangan oraliqda tushgan pul");
    default: return t("{month}da tushgan pul", { month: monthShort(startDate.slice(0, 7), t) });
  }
}

/** «Nimaga ketdi» filter options: the URL value → the server's part and the option's name (spec B4 §3.5). Draw `label` with `t()`. */
export const PART_FILTER: Record<"joriy" | "oldindan" | "qarz", { kind: "CURRENT" | "ADVANCE" | "LATE"; label: string }> = {
  joriy: { kind: "CURRENT", label: msg("Shu oy to'lovi") },
  oldindan: { kind: "ADVANCE", label: msg("Oldindan") },
  qarz: { kind: "LATE", label: msg("Eski qarz") },
};

/** Draw `label` with `t()`. */
export const METHOD_FILTER: { value: string; label: string }[] = [
  { value: "CASH", label: msg("Naqd") },
  { value: "CLICK", label: msg("Click") },
  { value: "PAYME", label: msg("Payme") },
  { value: "TRANSFER", label: msg("O'tkazma") },
  { value: "QR", label: msg("QR-kod") },
  { value: "UZUM", label: msg("Uzum") },
];
