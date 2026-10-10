import { formatNumber, formatPrice } from "@/lib/format-utils";
import { instantDate } from "../debt/debt-format";
import { isMonthlyBillingMonth } from "../overview/overview-math";
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

/** «Ishladi»: a teacher's `fullDeserved` (null without lesson data), a staff member's `monthly`. */
const workedOf = (row: SalaryDetail["row"]) => ("fullDeserved" in row ? row.fullDeserved : row.monthly);

export interface CalcLine {
  label: string;
  value: number;
  sign: "+" | "-" | "=" | "±";
}

/**
 * «Hisob»: Ishladi − Avans = Beriladi. When the frozen payment no longer
 * equals the live legs (data changed after the cron), one more line closes
 * the equation on it. Before 2026-07 the server sets `fullDeserved` to the pay
 * base, so the difference there is a real change too.
 */
export function calcLines(detail: SalaryDetail): CalcLine[] {
  const { row } = detail;
  const worked = workedOf(row);
  const diff = detail.afterCalcDiff;
  const lines: CalcLine[] = [];
  if (worked != null) lines.push({ label: "Ishladi", value: worked, sign: "+" });
  lines.push({ label: "Avans (ushlanadi)", value: row.advances, sign: "-" });
  if (diff) lines.push({ label: "Hisoblangandan keyin o'zgardi", value: diff, sign: "±" });
  lines.push({ label: "Beriladi", value: live(row.payment)?.amount ?? row.netToPay, sign: "=" });
  return lines;
}

/**
 * Under the advance line while nothing is calculated yet and the advances
 * outrun the earnings so far: the server shows «Beriladi» as 0 (it clamps),
 * so the equation does not close, and this says why.
 */
export function advanceAheadNote(detail: SalaryDetail): string | null {
  const worked = workedOf(detail.row);
  if (live(detail.row.payment) || worked == null || worked - detail.row.advances >= 0) return null;
  return "Avans hozircha ishlanganidan ko'p — qolgani oy oxirigacha ishlanganidan ushlanadi.";
}

type ButtonState = "enabled" | "disabled" | null;

/**
 * Which workflow buttons the footer draws (null = not drawn). Each is drawn
 * only for a viewer with its capability, and only while the row's payment has
 * not passed that step: shut in the open month and before its turn, open when
 * the payment waits for it.
 */
export function drawerButtons(
  state: MonthStateKind,
  payment: RowPayment | null,
  canClose: boolean,
  canPay: boolean,
): { approve: ButtonState; pay: ButtonState } {
  const status = live(payment)?.status;
  const open = state === "OPEN";
  const approve: ButtonState = !canClose ? null : open ? "disabled" : status === "CALCULATED" ? "enabled" : null;
  const pay: ButtonState =
    !canPay ? null : open || status === "CALCULATED" ? "disabled" : status === "APPROVED" ? "enabled" : null;
  return { approve, pay };
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
