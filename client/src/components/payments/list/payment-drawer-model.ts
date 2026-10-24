import { CORRECTION_WINDOW_MS } from "@/components/students/statement/statement-utils";
import type { Translate } from "@/components/payments/record-payment-admission";
import { formatPhone } from "@/lib/format-utils";
import { interpolate } from "@/i18n/translate";
import { tashkentDdMm, tashkentHhmm, tashkentWallClock } from "@/lib/tashkent-time";
import type { PaymentRow, PeriodView } from "./payments-list-types";

/** «dd.MM.yyyy HH:mm» on the Tashkent clock. */
export function dateTimeText(iso: string): string {
  const t = tashkentWallClock(iso);
  const yyyy = String(t.getUTCFullYear());
  return `${tashkentDdMm(iso)}.${yyyy} ${tashkentHhmm(iso)}`;
}

/** «ID 10001 · 90 000 00 00 · A1-01 · 10.10 18:20»: no `+998`, and no group part when the student has none (spec B4 §3.8). */
export function headerLine(row: PaymentRow, t: Translate = interpolate): string {
  const phone = row.student.phone ? formatPhone(row.student.phone).replace(/^\+998 /, "") : null;
  return [t("ID {id}", { id: row.student.id }), phone, row.groups[0]?.name ?? null, `${tashkentDdMm(row.createdAt)} ${tashkentHhmm(row.createdAt)}`]
    .filter((p) => p !== null)
    .join(" · ");
}

export function sumLabel(row: PaymentRow, t: Translate = interpolate): string {
  if (row.status === "REVERSED") return row.correctedBy ? t("Summa · tuzatildi") : t("Summa · bekor qilingan");
  return t("Summa");
}

export function sourceText(row: PaymentRow, t: Translate = interpolate): string {
  return row.source === "GATEWAY_WEBHOOK" ? t("Onlayn, avtomatik tushgan") : t("Admin kiritgan");
}

/** «Tanlangan davr (01.10–31.10) oxiriga ko'ra.» from the `YYYY-MM-DD` bounds the server used. */
export function periodNote(period: PeriodView, t: Translate = interpolate): string {
  const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  return t("Tanlangan davr ({start}–{end}) oxiriga ko'ra.", { start: dm(period.start), end: dm(period.end) });
}

/** «09.10.2026 17:20 · Ism Familiya · Sabab: …» — a dash for a missing author or reason; null when not cancelled. */
export function reversalLine(row: PaymentRow, t: Translate = interpolate): string | null {
  const r = row.reversal;
  if (!r) return null;
  const by = r.by ? `${r.by.firstName} ${r.by.lastName}` : "—";
  return `${dateTimeText(r.at)} · ${by} · ${t("Sabab: {reason}", { reason: r.reason?.trim() || "—" })}`;
}

/** The grey lines under the buttons, built from what the viewer can do (never from role names). */
export function footerHints(caps: { correct: boolean; undo: boolean }, t: Translate = interpolate): string[] {
  const hints: string[] = [];
  if (caps.correct) hints.push(t("Tuzatish: summa o'zgarsa sabab yozish majburiy."));
  if (caps.undo) hints.push(t("To'lovni bekor qilish: sabab yozish majburiy."));
  return hints;
}

/** Only the CEO corrects a payment older than 72 hours (the server re-checks). */
export function correctionLocked(row: PaymentRow, isCeo: boolean, now: Date): boolean {
  return !isCeo && now.getTime() - new Date(row.createdAt).getTime() > CORRECTION_WINDOW_MS;
}

export type DrawerState = "ok" | "notFound" | "error";

export function drawerState(error: unknown): DrawerState {
  if (error === null || error === undefined) return "ok";
  return (error as { response?: { status?: number } }).response?.status === 404 ? "notFound" : "error";
}
