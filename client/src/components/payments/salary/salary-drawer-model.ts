import { interpolate } from "@/i18n/translate";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { csvCell } from "@/components/forms/responses/submission-format";
import { instantDate } from "../debt/debt-format";
import { isMonthlyBillingMonth } from "../overview/overview-math";
import type { Translate } from "../record-payment-admission";
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
// The words take an optional last `t` (default: the Uzbek source); the CSV stays Uzbek.

/** The «Stavka» line. `coverage` is the staff row's days; `monthKey` decides a per-student rate's unit. */
export function rateText(
  rate: RateRef | null | undefined,
  kind: "teacher" | "staff",
  coverage?: { activeDays: number; cycleDays: number },
  monthKey?: string,
  t: Translate = interpolate,
): string {
  if (!rate) return kind === "teacher" ? t("Guruhlar bo'yicha — pastda") : t("Stavka qo'yilmagan");
  const value = formatPrice(rate.value);
  switch (rate.salaryType) {
    case "PERCENTAGE":
      return t("Foiz: o'quvchi to'lovining {value}%", { value: formatNumber(rate.value) });
    case "FIXED_PER_STUDENT":
      // Before monthly billing the rate was per cycle (server `rateBasis`).
      return monthKey && !isMonthlyBillingMonth(monthKey)
        ? t("Har o'quvchi uchun tsikliga {value} so'm", { value })
        : t("Har o'quvchi uchun oyiga {value} so'm", { value });
    case "FIXED_MONTHLY": {
      // `activeDays: 0` is a row that exists only for its payment, not a 0-day salary.
      return coverage && coverage.activeDays > 0 && coverage.activeDays < coverage.cycleDays
        ? t("Oyiga {value} so'm; oyning {total} kunidan {days} tasi", {
            value,
            total: coverage.cycleDays,
            days: coverage.activeDays,
          })
        : t("Oyiga {value} so'm", { value });
    }
  }
}

/** A payment the cron wrote and nobody cancelled; a cancelled one counts as none. */
const live = (p: RowPayment | null) => (p && p.status !== "CANCELLED" ? p : null);

export function drawerTotalLabel(
  state: MonthStateKind,
  payment: RowPayment | null,
  t: Translate = interpolate,
): string {
  if (state === "OPEN") return t("Oy oxirida beriladi");
  return live(payment)?.status === "PAID" ? t("Berildi") : t("Beriladi");
}

/**
 * The line under the action buttons: what opens them, or why they stay shut.
 * `lowerMonth`: the month name inside the sentence is lower-cased (Uzbek, Russian), not in de/en.
 */
export function drawerHint(
  state: MonthStateKind,
  payment: RowPayment | null,
  month: string,
  t: Translate = interpolate,
  lowerMonth = true,
): string {
  if (state === "OPEN") {
    const next = monthShort(addMonths(month, 1), t);
    return t("Tasdiqlash va «Berildi» — oy hisoblangach (1-{month}) ochiladi.", {
      month: lowerMonth ? next.toLowerCase() : next,
    });
  }
  switch (live(payment)?.status) {
    case "CALCULATED":
      return t("Avval CEO tasdiqlaydi, keyin «Berildi» ochiladi.");
    case "APPROVED":
      return t("«Berildi» — CEO yoki filial direktori.");
    case "PAID":
      return t("Berilgan oylik o'zgartirilmaydi.");
    default:
      return t("Bu oy uchun oylik hisoblanmagan.");
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
export function calcLines(detail: SalaryDetail, t: Translate = interpolate): CalcLine[] {
  const { row } = detail;
  const worked = workedOf(row);
  const diff = detail.afterCalcDiff;
  const lines: CalcLine[] = [];
  if (worked != null) lines.push({ label: t("Ishladi"), value: worked, sign: "+" });
  lines.push({ label: t("Avans (ushlanadi)"), value: row.advances, sign: "-" });
  if (diff) lines.push({ label: t("Hisoblangandan keyin o'zgardi"), value: diff, sign: "±" });
  lines.push({ label: t("Beriladi"), value: live(row.payment)?.amount ?? row.netToPay, sign: "=" });
  return lines;
}

/**
 * Under the advance line while nothing is calculated yet and the advances
 * outrun the earnings so far: the server shows «Beriladi» as 0 (it clamps),
 * so the equation does not close, and this says why.
 */
export function advanceAheadNote(detail: SalaryDetail, t: Translate = interpolate): string | null {
  const worked = workedOf(detail.row);
  if (live(detail.row.payment) || worked == null || worked - detail.row.advances >= 0) return null;
  return t("Avans hozircha ishlanganidan ko'p — qolgani oy oxirigacha ishlanganidan ushlanadi.");
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
export function splitLine(row: TeacherRow, t: Translate = interpolate): string | null {
  if (!row.hasLessonData || row.covered == null || row.centerFunded == null) return null;
  if (row.centerFunded <= 0) return t("hammasini o'quvchilar to'lagan");
  return t("shundan o'quvchilar to'lagan {covered} · markaz qo'shdi {center} (o'quvchilar hali to'lamagan)", {
    covered: formatPrice(row.covered),
    center: formatPrice(row.centerFunded),
  });
}

/** The green PAID box: the Tashkent day, one line per cash slice, who marked it. */
export function payoutLines(
  payout: NonNullable<SalaryDetail["payout"]>,
  t: Translate = interpolate,
): {
  title: string;
  slices: string[];
  by: string | null;
} {
  return {
    title: payout.paidAt ? t("Berildi {date}", { date: instantDate(payout.paidAt) }) : t("Berildi"),
    // The account name is data.
    slices: payout.slices.map((s) =>
      s.accountType === "CASH"
        ? t("naqd {amount} — {account}", { amount: formatPrice(s.amount), account: s.accountName })
        : t("karta {amount} — {account}", { amount: formatPrice(s.amount), account: s.accountName }),
    ),
    by: payout.paidBy
      ? t("Kim belgiladi: {name}", { name: `${payout.paidBy.firstName} ${payout.paidBy.lastName}` })
      : null,
  };
}

// The CSV opens in Excel, so it carries Uzbek names, never «FIXED_PER_STUDENT».
const RATE_SCOPE_NAMES = { GROUP: "Guruh", GLOBAL: "Umumiy" } as const;

// Text goes through the lead export's `csvCell`, which neutralises `= + - @` (student names come from Telegram).
const lessonCell = (cell: string | number) => (typeof cell === "number" ? String(cell) : csvCell(cell));

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
  return `﻿${rows.map((r) => r.map(lessonCell).join(",")).join("\n")}`;
}
