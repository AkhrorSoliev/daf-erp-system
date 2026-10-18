import { interpolate } from "@/i18n/translate";
import { tashkentDdMm } from "@/lib/tashkent-time";
import { dayMonth, monthRange } from "../overview/overview-math";
import type { Translate } from "../record-payment-admission";
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
// (ADR-0006) and chooses the words. The words take an optional last `t`
// (default: the Uzbek source), so the tests read the Uzbek text.

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
  /** A staff member whose pay the CEO set by hand (ADR-0112). */
  manual?: boolean;
}

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

/** «qat'iy oylik», plus the days when the salary was on for only part of the period. */
export function staffFrom(row: StaffRow, t: Translate = interpolate): string {
  const c = row.coverage;
  // `activeDays: 0` is a row that exists only for its payment, not a 0-day salary.
  return c && c.activeDays > 0 && c.activeDays < c.cycleDays
    ? t("qat'iy oylik · {days}/{total} kun", { days: c.activeDays, total: c.cycleDays })
    : t("qat'iy oylik");
}

/** Teachers first, in the server's order, then the staff. */
export function mergePeople(data: MonthlyResponse, t: Translate = interpolate): PersonRow[] {
  return [
    ...data.data.map(
      (row): PersonRow => ({
        kind: "teacher",
        userId: row.user.id,
        name: fullName(row.user),
        role: t("Ustoz"),
        isActive: row.user.isActive,
        from: row.hasLessonData
          ? t("{groups} guruh · {students} o'quvchi", { groups: row.groupCount, students: row.studentCount })
          : "—",
        worked: row.fullDeserved,
        advances: row.advances,
        net: row.netToPay,
        payment: row.payment,
      }),
    ),
    ...data.staff.map(
      (s): PersonRow => ({
        kind: "staff",
        userId: s.user.id,
        name: fullName(s.user),
        role: staffRoleText(s.user.position, t),
        isActive: s.user.isActive,
        from: staffFrom(s, t),
        worked: s.monthly,
        advances: s.advances,
        net: s.netToPay,
        payment: s.payment,
        manual: !!s.adjustment,
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
export function segmentLabels(
  data: MonthlyResponse | undefined,
  t: Translate = interpolate,
): Record<"all" | "teachers" | "staff", string> {
  if (!data) return { all: t("Hammasi"), teachers: t("Ustozlar"), staff: t("Xodimlar") };
  return {
    all: `${t("Hammasi")} · ${data.data.length + data.staff.length}`,
    teachers: `${t("Ustozlar")} · ${data.data.length}`,
    staff: `${t("Xodimlar")} · ${data.staff.length}`,
  };
}

/** The pill beside «{Oy} oyliklari». */
export function monthStatePill(
  state: MonthState,
  month: string,
  t: Translate = interpolate,
): { text: string; tone: Tone } {
  switch (state.kind) {
    case "OPEN":
      return {
        text: t("Oy davom etmoqda · {date} dan keyin hisoblanadi", { date: dayMonth(monthRange(month).endDate) }),
        tone: "muted",
      };
    case "NOT_CALCULATED":
      return { text: t("Hisoblanmagan"), tone: "muted" };
    case "CALCULATED":
      return { text: t("Hisoblandi · tasdiqlash kutilmoqda"), tone: "amber" };
    case "APPROVED":
      return { text: t("Tasdiqlandi · berish kutilmoqda"), tone: "blue" };
    case "PARTLY_PAID":
      return {
        text: t("Qisman berildi · {paid} / {total}", { paid: state.paidCount, total: state.payableCount }),
        tone: "blue",
      };
    case "PAID":
      return { text: t("Berildi"), tone: "green" };
  }
}

/** The «Holat» cell. An open month says so whatever its payment holds. */
export function rowStatus(
  payment: RowPayment | null,
  state: MonthStateKind,
  t: Translate = interpolate,
): { text: string; tone: Tone } {
  if (state === "OPEN") return { text: t("oy davom etmoqda"), tone: "muted" };
  switch (payment?.status) {
    case "CALCULATED":
      return { text: t("hisoblandi"), tone: "amber" };
    case "APPROVED":
      return { text: t("tasdiqlandi"), tone: "blue" };
    case "PAID":
      return {
        text: payment.paidAt ? t("berildi {date}", { date: tashkentDdMm(payment.paidAt) }) : t("berildi"),
        tone: "green",
      };
    default:
      // No payment, or a cancelled one: nothing was calculated for this person.
      return { text: t("hisoblanmagan"), tone: "muted" };
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
  const noLessonData = data.data.length > 0 && data.data.every((row) => !row.hasLessonData);
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
export function netLabel(state: MonthState, t: Translate = interpolate): { label: string; sub: string | null } {
  if (state.kind === "OPEN") return { label: t("Oy oxirida beriladi"), sub: null };
  if (state.kind === "PARTLY_PAID") {
    return {
      label: t("Beriladi"),
      sub: t("{paid} kishiga berildi · {left} kishi qoldi", {
        paid: state.paidCount,
        left: state.payableCount - state.paidCount,
      }),
    };
  }
  return { label: t("Beriladi"), sub: null };
}

/**
 * «shundan markaz qo'shdi — X»: only for a month with lesson data in which the center put money in.
 * `lowerMonth`: the month name inside the sentence is lower-cased (Uzbek, Russian), not in de/en.
 */
export function centerLine(
  data: MonthlyResponse,
  t: Translate = interpolate,
  lowerMonth = true,
): { amount: number; note: string } | null {
  if (data.totals.centerFunded <= 0 || !data.data.some((row) => row.hasLessonData)) return null;
  const month = monthShort(data.month, t);
  return {
    amount: data.totals.centerFunded,
    note: t("o'quvchilar {month} to'lovini hali to'lamagan; to'lagan sari kamayadi", {
      month: lowerMonth ? month.toLowerCase() : month,
    }),
  };
}
