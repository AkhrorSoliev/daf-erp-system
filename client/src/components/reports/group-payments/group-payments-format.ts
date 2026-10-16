import { monthShort } from "@/components/payments/salary-utils";
import { formatPercent, formatPrice } from "@/lib/format-utils";
import type { GpGroupResponse, GpStudentLine, GroupMark, Kesim, PayStatus, StudentMark, Tartib } from "./group-payments-types";

export const KESIM_OPTIONS: { value: Kesim; label: string }[] = [
  { value: "guruh", label: "Guruhlar" },
  { value: "ustoz", label: "Ustozlar" },
  { value: "kurs", label: "Kurslar" },
];
export const TARTIB_OPTIONS: { value: Tartib; label: string }[] = [
  { value: "foiz", label: "Eng past foiz" },
  { value: "qoldi", label: "Eng ko'p qoldi" },
  { value: "nomi", label: "Nomi" },
];
export const FIRST_COLUMN: Record<Kesim, string> = { guruh: "Guruh", ustoz: "Ustoz", kurs: "Kurs" };
export const GROUP_MARK_LABEL: Record<GroupMark, string> = { ochirilgan: "o'chirilgan", yopilgan: "yopilgan" };
export const PAY_STATUS_LABEL: Record<PayStatus, string> = { toladi: "to'ladi", qisman: "qisman", tolamagan: "to'lamagan" };
export const STUDENT_MARK_LABEL: Record<StudentMark, string> = { arxivda: "arxivda", muzlatilgan: "muzlatilgan", chiqqan: "guruhdan chiqqan" };

export const QOLDI_NOTE = "Qoldi — bugungi balans bo'yicha: o'quvchi keyinroq to'lasa, o'tgan oyning ham «Qoldi»si kamayadi.";
export const MULTI_TEACHER_NOTE = "Ikki ustozli guruh har ikkala ustozda sanaladi — ustozlar yig'indisi jamidan katta bo'lishi mumkin.";
export const SAME_AS_OVERVIEW = "Umumiy ma'lumotlardagi 1-qator bilan bir xil raqamlar";

export type Tone = "green" | "amber" | "red" | "muted";

/** The «Foiz» colour (spec B5 §3.5): ≥ 90 green, ≥ 50 amber, below red; no percentage muted. */
export function pctTone(pct: number | null): Tone {
  if (pct === null) return "muted";
  return pct >= 90 ? "green" : pct >= 50 ? "amber" : "red";
}
export const PAY_STATUS_TONE: Record<PayStatus, Tone> = { toladi: "green", qisman: "amber", tolamagan: "red" };

/** The server's one-decimal percentage, whole on screen (spec B5 §4.3); «—» when nothing was charged. */
export const pctText = (pct: number | null): string => (pct === null ? "—" : formatPercent(Math.round(pct)));

export const summaryTitle = (month: string): string => `${monthShort(month)} oyi to'lovlari — guruhlar kesimida`;

/** A student who paid shows what was charged, the others what is left (spec B5 §3.6). */
export function studentAmountText(s: Pick<GpStudentLine, "status" | "charged" | "unpaid">): string {
  return s.status === "toladi" ? `hisoblandi ${formatPrice(s.charged)}` : `qoldi ${formatPrice(s.unpaid)}`;
}

/** «{Kurs} · {Ustoz(lar)} · N o'quvchi». */
export function drawerSubtitle(group: GpGroupResponse["group"], students: number): string {
  return [group.course, group.teachers.length ? group.teachers.join(", ") : "Ustozsiz", `${students} o'quvchi`].join(" · ");
}
