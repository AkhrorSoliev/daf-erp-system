import { formatNumber, formatPrice } from "@/lib/format-utils";
import { tashkentDdMm } from "@/lib/tashkent-time";
import { dayMonth, monthRange } from "../overview/overview-math";
import { monthShort, staffRoleText } from "../salary-utils";
import type {
  MonthlyResponse,
  MonthState,
  MonthStateKind,
  RowPayment,
  StaffRow,
} from "./salary-types";

// The «Ish haqi» table and summary as pure functions of the server's answer.
// Every figure is the server's; this file only adds the legs it sent
// (ADR-0006) and chooses the words.

export type PersonKind = "teacher" | "staff";
export type Tone = "muted" | "amber" | "blue" | "green";

/** One table row, teacher or staff. `worked` is null for a month without lesson data. */
export interface PersonRow {
  kind: PersonKind;
  userId: number;
  name: string;
  role: string;
  isActive: boolean;
  /** «Nimadan» column. */
  from: string;
  worked: number | null;
  advances: number;
  net: number;
  payment: RowPayment | null;
}

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

/** «qat'iy oylik», plus the days when the salary was on for only part of the period. */
export function staffFrom(row: StaffRow): string {
  const c = row.coverage;
  // `activeDays: 0` is a row that exists only for its payment, not a 0-day salary.
  return c && c.activeDays > 0 && c.activeDays < c.cycleDays
    ? `qat'iy oylik · ${c.activeDays}/${c.cycleDays} kun`
    : "qat'iy oylik";
}

/** Teachers first, in the server's order, then the staff. */
export function mergePeople(data: MonthlyResponse): PersonRow[] {
  return [
    ...data.data.map(
      (t): PersonRow => ({
        kind: "teacher",
        userId: t.user.id,
        name: fullName(t.user),
        role: "Ustoz",
        isActive: t.user.isActive,
        from: t.hasLessonData ? `${t.groupCount} guruh · ${t.studentCount} o'quvchi` : "—",
        worked: t.fullDeserved,
        advances: t.advances,
        net: t.netToPay,
        payment: t.payment,
      }),
    ),
    ...data.staff.map(
      (s): PersonRow => ({
        kind: "staff",
        userId: s.user.id,
        name: fullName(s.user),
        role: staffRoleText(s.user.position),
        isActive: s.user.isActive,
        from: staffFrom(s),
        worked: s.monthly,
        advances: s.advances,
        net: s.netToPay,
        payment: s.payment,
      }),
    ),
  ];
}

export function filterPeople(rows: PersonRow[], kim: "all" | "teachers" | "staff"): PersonRow[] {
  if (kim === "all") return rows;
  const kind: PersonKind = kim === "teachers" ? "teacher" : "staff";
  return rows.filter((r) => r.kind === kind);
}

/** The segment above the table; the counts wait for an answer, so a waiting request never reads «· 0». */
export function segmentLabels(data: MonthlyResponse | undefined): Record<"all" | "teachers" | "staff", string> {
  if (!data) return { all: "Hammasi", teachers: "Ustozlar", staff: "Xodimlar" };
  return {
    all: `Hammasi · ${data.data.length + data.staff.length}`,
    teachers: `Ustozlar · ${data.data.length}`,
    staff: `Xodimlar · ${data.staff.length}`,
  };
}

/** The pill beside «{Oy} oyliklari». */
export function monthStatePill(state: MonthState, month: string): { text: string; tone: Tone } {
  switch (state.kind) {
    case "OPEN":
      return {
        text: `Oy davom etmoqda · ${dayMonth(monthRange(month).endDate)} dan keyin hisoblanadi`,
        tone: "muted",
      };
    case "NOT_CALCULATED":
      return { text: "Hisoblanmagan", tone: "muted" };
    case "CALCULATED":
      return { text: "Hisoblandi · tasdiqlash kutilmoqda", tone: "amber" };
    case "APPROVED":
      return { text: "Tasdiqlandi · berish kutilmoqda", tone: "blue" };
    case "PARTLY_PAID":
      return { text: `Qisman berildi · ${state.paidCount} / ${state.payableCount}`, tone: "blue" };
    case "PAID":
      return { text: "Berildi", tone: "green" };
  }
}

/** The «Holat» cell. An open month says so whatever its payment holds. */
export function rowStatus(
  payment: RowPayment | null,
  state: MonthStateKind,
): { text: string; tone: Tone } {
  if (state === "OPEN") return { text: "oy davom etmoqda", tone: "muted" };
  switch (payment?.status) {
    case "CALCULATED":
      return { text: "hisoblandi", tone: "amber" };
    case "APPROVED":
      return { text: "tasdiqlandi", tone: "blue" };
    case "PAID":
      return {
        text: payment.paidAt ? `berildi ${tashkentDdMm(payment.paidAt)}` : "berildi",
        tone: "green",
      };
    default:
      // No payment, or a cancelled one: nothing was calculated for this person.
      return { text: "hisoblanmagan", tone: "muted" };
  }
}

/**
 * The summary card's figures. «Ishladi» = the teachers' `fullDeserved` + the
 * staff's `monthly`, as the B1 card adds them; a month in which no teacher has
 * lesson data (May) has no teachers' figure and so no total.
 */
export function summaryNumbers(data: MonthlyResponse): {
  worked: number | null;
  teachersWorked: number | null;
  staffWorked: number;
  advances: number;
  advanceCount: number;
  net: number;
  teacherCount: number;
  staffCount: number;
} {
  const noLessonData = data.data.length > 0 && data.data.every((t) => !t.hasLessonData);
  const teachersWorked = noLessonData ? null : data.totals.fullDeserved;
  const staffWorked = data.staffTotals.monthly;
  return {
    worked: teachersWorked == null ? null : teachersWorked + staffWorked,
    teachersWorked,
    staffWorked,
    advances: data.totals.advances + data.staffTotals.advances,
    advanceCount: data.totals.advanceCount + data.staffTotals.advanceCount,
    net: data.totals.netToPay + data.staffTotals.netToPay,
    teacherCount: data.data.length,
    staffCount: data.staff.length,
  };
}

/** Title and sub-line of the third figure; `sub: null` means «N ustoz · M xodim». */
export function netLabel(state: MonthState): { label: string; sub: string | null } {
  if (state.kind === "OPEN") return { label: "Oy oxirida beriladi", sub: null };
  if (state.kind === "PARTLY_PAID") {
    return {
      label: "Beriladi",
      sub: `${state.paidCount} kishiga berildi · ${state.payableCount - state.paidCount} kishi qoldi`,
    };
  }
  return { label: "Beriladi", sub: null };
}

/** «shundan markaz qo'shdi — X»: only for a month with lesson data in which the center put money in. */
export function centerLine(data: MonthlyResponse): { amount: number; note: string } | null {
  if (data.totals.centerFunded <= 0 || !data.data.some((t) => t.hasLessonData)) return null;
  return {
    amount: data.totals.centerFunded,
    note: `o'quvchilar ${monthShort(data.month).toLowerCase()} to'lovini hali to'lamagan; to'lagan sari kamayadi`,
  };
}

/**
 * Short money for the summary and the tab labels: 10 500 000 → «10,5 mln»; a
 * sum under 100 000 would round to «0 mln», so it is written in full. Tables use `formatPrice`.
 */
export function mln(value: number): string {
  if (value < 100_000) return `${formatPrice(value)} so'm`;
  return `${formatNumber(value / 1_000_000, { maximumFractionDigits: 1 })} mln`;
}
