import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import type { Translate } from "@/components/notifications/notification-view";
import { monthShort } from "@/components/payments/salary-utils";
import { formatPercent, formatPrice } from "@/lib/format-utils";
import type { GpGroupResponse, GpStudentLine, GroupMark, Kesim, PayStatus, StudentMark, Tartib } from "./group-payments-types";

export const KESIM_OPTIONS: { value: Kesim; label: string }[] = [
  { value: "guruh", label: msg("Guruhlar") },
  { value: "ustoz", label: msg("Ustozlar") },
  { value: "kurs", label: msg("Kurslar") },
];
export const TARTIB_OPTIONS: { value: Tartib; label: string }[] = [
  { value: "foiz", label: msg("Eng past foiz") },
  { value: "qoldi", label: msg("Eng ko'p qoldi") },
  { value: "nomi", label: msg("Nomi") },
];
export const FIRST_COLUMN: Record<Kesim, string> = { guruh: msg("Guruh"), ustoz: msg("Ustoz"), kurs: msg("Kurs") };
export const GROUP_MARK_LABEL: Record<GroupMark, string> = { ochirilgan: msg("o'chirilgan"), yopilgan: msg("yopilgan") };
export const PAY_STATUS_LABEL: Record<PayStatus, string> = { toladi: msg("to'ladi"), qisman: msg("qisman"), tolamagan: msg("to'lamagan") };
export const STUDENT_MARK_LABEL: Record<StudentMark, string> = {
  arxivda: msg("arxivda"),
  muzlatilgan: msg("muzlatilgan"),
  chiqqan: msg("guruhdan chiqqan"),
};

export const QOLDI_NOTE = msg("Qoldi — bugungi balans bo'yicha: o'quvchi keyinroq to'lasa, o'tgan oyning ham «Qoldi»si kamayadi.");
export const MULTI_TEACHER_NOTE = msg("Ikki ustozli guruh har ikkala ustozda sanaladi — ustozlar yig'indisi jamidan katta bo'lishi mumkin.");
export const SAME_AS_OVERVIEW = msg("Umumiy ma'lumotlardagi 1-qator bilan bir xil raqamlar");

export type Tone = "green" | "amber" | "red" | "muted";

/** The «Foiz» colour (spec B5 §3.5), from the same whole number that is printed (89.6 → «90%» green): ≥ 90 green, ≥ 50 amber, below red; no percentage muted. */
export function pctTone(pct: number | null): Tone {
  if (pct === null) return "muted";
  const shown = Math.round(pct);
  return shown >= 90 ? "green" : shown >= 50 ? "amber" : "red";
}
export const PAY_STATUS_TONE: Record<PayStatus, Tone> = { toladi: "green", qisman: "amber", tolamagan: "red" };

/** The server's one-decimal percentage, whole on screen (spec B5 §4.3); «—» when nothing was charged. */
export const pctText = (pct: number | null): string => (pct === null ? "—" : formatPercent(Math.round(pct)));

export const summaryTitle = (month: string, t: Translate = interpolate): string =>
  t("{month} oyi to'lovlari — guruhlar kesimida", { month: monthShort(month, t) });

/** A student who paid shows what was charged, the others what is left (spec B5 §3.6). */
export function studentAmountText(s: Pick<GpStudentLine, "status" | "charged" | "unpaid">, t: Translate = interpolate): string {
  return s.status === "toladi"
    ? t("hisoblandi {sum}", { sum: formatPrice(s.charged) })
    : t("qoldi {sum}", { sum: formatPrice(s.unpaid) });
}

/** «{Kurs} · {Ustoz(lar)} · N o'quvchi». */
export function drawerSubtitle(group: GpGroupResponse["group"], students: number, t: Translate = interpolate): string {
  const teachers = group.teachers.length ? group.teachers.join(", ") : t("Ustozsiz");
  return [group.course, teachers, t("{n} o'quvchi", { n: students })].join(" · ");
}
