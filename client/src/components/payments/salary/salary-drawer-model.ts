import { formatNumber, formatPrice } from "@/lib/format-utils";
import { instantDate } from "../debt/debt-format";
import { FULL_TEACHER_PAY_MONTH, isMonthlyBillingMonth } from "../overview/overview-math";
import { addMonths, monthShort, SALARY_TYPE_LABELS } from "../salary-utils";
import type {
  BreakdownLine,
  MonthStateKind,
  RateRef,
  RowPayment,
  SalaryDetail,
  TeacherRow,
} from "./salary-types";

// The row drawer's words as pure functions of the detail answer (spec §2.5).
// Every figure is the server's (ADR-0006); this file only picks the wording.

/** The «Stavka» line. `coverage` is the staff row's days; `monthKey` decides a per-student rate's unit. */
export function rateText(
  rate: RateRef | null | undefined,
  kind: "teacher" | "staff",
  coverage?: { activeDays: number; cycleDays: number },
  monthKey?: string,
): string {
  if (!rate) return kind === "teacher" ? "Guruhlar bo'yicha — pastda" : "Stavka qo'yilmagan";
  const value = formatPrice(rate.value);
  switch (rate.salaryType) {
    case "PERCENTAGE":
      return `Foiz: o'quvchi to'lovining ${formatNumber(rate.value)}%`;
    case "FIXED_PER_STUDENT":
      // Before monthly billing the rate was per cycle (server `rateBasis`).
      return monthKey && !isMonthlyBillingMonth(monthKey)
        ? `Har o'quvchi uchun tsikliga ${value} so'm`
        : `Har o'quvchi uchun oyiga ${value} so'm`;
    case "FIXED_MONTHLY": {
      // `activeDays: 0` is a row that exists only for its payment, not a 0-day salary.
      const part =
        coverage && coverage.activeDays > 0 && coverage.activeDays < coverage.cycleDays
          ? `; oyning ${coverage.cycleDays} kunidan ${coverage.activeDays} tasi`
          : "";
      return `Oyiga ${value} so'm${part}`;
    }
  }
}

/** A payment the cron wrote and nobody cancelled; a cancelled one counts as none. */
const live = (p: RowPayment | null) => (p && p.status !== "CANCELLED" ? p : null);

export function drawerTotalLabel(state: MonthStateKind, payment: RowPayment | null): string {
  if (state === "OPEN") return "Oy oxirida beriladi";
  return live(payment)?.status === "PAID" ? "Berildi" : "Beriladi";
}

/** The line under the action buttons: what opens them, or why they stay shut. */
export function drawerHint(state: MonthStateKind, payment: RowPayment | null, month: string): string {
  if (state === "OPEN") {
    const next = monthShort(addMonths(month, 1)).toLowerCase();
    return `Tasdiqlash va «Berildi» — oy hisoblangach (1-${next}) ochiladi.`;
  }
  switch (live(payment)?.status) {
    case "CALCULATED":
      return "Avval CEO tasdiqlaydi, keyin «Berildi» ochiladi.";
    case "APPROVED":
      return "«Berildi» — CEO yoki filial direktori.";
    case "PAID":
      return "Berilgan oylik o'zgartirilmaydi.";
    default:
      return "Bu oy uchun oylik hisoblanmagan.";
  }
}

export interface CalcLine {
  label: string;
  value: number;
  sign: "+" | "-" | "=" | "±";
}

/**
 * «Hisob»: Ishladi − Avans = Beriladi. When the frozen payment no longer
 * equals the live legs, one more line closes the equation on it. Before full
 * teacher pay (2026-07) a teacher's payment was based on `covered`, so the
 * difference there is the base, not a change, and is not shown.
 */
export function calcLines(detail: SalaryDetail): CalcLine[] {
  const { row } = detail;
  const worked = "fullDeserved" in row ? row.fullDeserved : row.monthly;
  const preFullPay = detail.kind === "teacher" && detail.month < FULL_TEACHER_PAY_MONTH;
  const diff = preFullPay ? null : detail.afterCalcDiff;
  const lines: CalcLine[] = [];
  if (worked != null) lines.push({ label: "Ishladi", value: worked, sign: "+" });
  lines.push({ label: "Avans (ushlanadi)", value: row.advances, sign: "-" });
  if (diff) lines.push({ label: "Hisoblangandan keyin o'zgardi", value: diff, sign: "±" });
  lines.push({ label: "Beriladi", value: live(row.payment)?.amount ?? row.netToPay, sign: "=" });
  return lines;
}

/** Under «Guruhlar bo'yicha»: how much of the pay the students covered and how much the center put in. */
export function splitLine(row: TeacherRow): string | null {
  if (!row.hasLessonData || row.covered == null || row.centerFunded == null) return null;
  if (row.centerFunded <= 0) return "hammasini o'quvchilar to'lagan";
  return `shundan o'quvchilar to'lagan ${formatPrice(row.covered)} · markaz qo'shdi ${formatPrice(
    row.centerFunded,
  )} (o'quvchilar hali to'lamagan)`;
}

/** The green PAID box: the Tashkent day, one line per cash slice, who marked it. */
export function payoutLines(payout: NonNullable<SalaryDetail["payout"]>): {
  title: string;
  slices: string[];
  by: string | null;
} {
  return {
    title: payout.paidAt ? `Berildi ${instantDate(payout.paidAt)}` : "Berildi",
    slices: payout.slices.map(
      (s) => `${s.accountType === "CASH" ? "naqd" : "karta"} ${formatPrice(s.amount)} — ${s.accountName}`,
    ),
    by: payout.paidBy ? `Kim belgiladi: ${payout.paidBy.firstName} ${payout.paidBy.lastName}` : null,
  };
}

// The CSV opens in Excel, so it carries Uzbek names, never «FIXED_PER_STUDENT».
const RATE_SCOPE_NAMES = { GROUP: "Guruh", GLOBAL: "Umumiy" } as const;

const csvCell = (cell: string | number) => {
  const s = String(cell);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** «Darslar bo'yicha (CSV)»: the old breakdown drawer's columns, UTF-8 with a BOM for Excel. */
export function csvFromLessons(lines: BreakdownLine[]): string {
  const rows: (string | number)[][] = [
    [
      "Sana",
      "O'quvchi",
      "Guruh",
      "Kurs",
      "Dars narxi",
      "Hisoblash turi",
      "Qiymat",
      "Qo'llanilish doirasi",
      "Summa",
      "Bekor qilingan",
      "Bekor qilingan sabab",
    ],
    ...lines.map((l) => [
      // A calendar date: read the day off the string, never through the browser's zone.
      l.lessonDate.slice(0, 10),
      `${l.student.firstName} ${l.student.lastName}`,
      l.group.name,
      l.group.course.name,
      l.perLessonCost,
      l.configVersion ? (SALARY_TYPE_LABELS[l.configVersion.salaryType] ?? l.configVersion.salaryType) : "",
      l.configVersion?.value ?? "",
      l.configVersion ? RATE_SCOPE_NAMES[l.configVersion.scope] : "",
      l.amount,
      l.reversedAt ? "ha" : "",
      l.reversalReason ?? "",
    ]),
  ];
  return `﻿${rows.map((r) => r.map(csvCell).join(",")).join("\n")}`;
}
