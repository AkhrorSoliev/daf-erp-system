import {
  AlarmClock,
  Check,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@/i18n/msg";
import { interpolate, type Params } from "@/i18n/translate";
import { formatShortDate, MONTH_NAMES } from "./attendance-cycle-utils";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

/** Oldindan belgilash turi — sababli (uzrli) yoki sababsiz (umuman kelmaydi). */
export type PlannedAbsenceKind = "SABABLI" | "SABABSIZ";

export interface StudentAttendance {
  studentId: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  balance?: number;
  isDebtor?: boolean;
  debtAmount?: number;
  status: AttendanceStatus | null;
  /** Recorded minutes late on a saved LATE row (ADR-0048). */
  lateMinutes?: number | null;
  note: string | null;
  // Oldindan davomat belgilash (pre-mark) — dars boshlanmasidan oldin admin
  // belgilab qo'ygan kelmaslik. status === null bo'lganda formani urug'lantiradi.
  plannedId?: string | null;
  plannedKind?: PlannedAbsenceKind | null;
  plannedNote?: string | null;
  plannedBy?: { id: number; firstName: string; lastName: string } | null;
  // Contract 3.2 (ADR-0047): may this student be marked for this lesson?
  // Absent on an older server — read as admitted.
  admission?: LessonAdmission;
}

/** Contract 3.2 admission of one student to this lesson (ADR-0047). */
export interface LessonAdmission {
  admitted: boolean;
  // LEFT_OUT: after the lesson, a student the register left out stays out,
  // paid or not (server `leftOutAfterEnd`). BELOW_MIN_SHARE: the lessons held
  // are paid for, the least share of the month is not (ADR-0064).
  reason:
    | "NOT_APPLIED"
    | "FIRST_LESSON"
    | "PAID"
    | "NOT_PAID"
    | "BELOW_MIN_SHARE"
    | "LEFT_OUT";
  /** The least payment that admits the student today. */
  shortfall: number;
  /** Admitted while owing: the last lesson this month the balance reaches. */
  paidThrough: string | null;
  /** BELOW_MIN_SHARE only: the share of the month that was asked for. */
  minPaidPercent?: number;
  /**
   * How far the payments reach into this group's month (server
   * `AdmissionReach`). Absent on an older server and on an earlier day's
   * register for an admitted student.
   */
  reach?: {
    lessons: number;
    paidLessons: number;
    lastPaid: string | null;
    monthCharged: number;
    monthPaid: number;
    next: { date: string; needed: number } | null;
  };
}

/** Qarzdorning joriy (eng so'nggi) sikli — sana oralig'i bilan. */
export interface DebtorCurrentCycle {
  cycleSequenceNumber: number;
  capacity: number;
  coveredCount: number;
  firstCoveredDate: string | null;
  lastCoveredDate: string | null;
}

/**
 * Returned by the admin variant of getByDate. Mirrors the active student
 * shape but adds the per-group debt info needed for the "Qarzdorlar" panel.
 */
export interface DebtorStudent {
  studentId: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  balance: number;
  debtAmount: number;
  // null = hech qachon to'liq sikl ochilmagan (sof qarz).
  currentCycle?: DebtorCurrentCycle | null;
  // Monthly group only (ADR-0062); null: no charge for the month yet.
  monthCoverage?: DebtorMonthCoverage | null;
}

/** A monthly group's debtor (ADR-0062): how far their money reaches into the register's month. */
export interface DebtorMonthCoverage {
  /** The student's lessons this month in the group. */
  lessons: number;
  /** How many of them, from the first, are paid. */
  paid: number;
  /** The last paid lesson, 'YYYY-MM-DD'; null when none. */
  paidThrough: string | null;
}

/** The page's `t` from `useT()`; without it the Uzbek source is read as written. */
type Translate = (source: string, params?: Params) => string;

/** The «Shu oy» cell of a monthly group's debtor (ADR-0062); `month` is 'YYYY-MM'. */
export function monthCoverageText(
  month: string,
  coverage: DebtorMonthCoverage | null | undefined,
  t: Translate = interpolate,
): string {
  const known = MONTH_NAMES[Number(month.slice(5, 7))];
  const word = known ? t(known) : month;
  const name = word.charAt(0).toUpperCase() + word.slice(1);
  if (!coverage) return t("{month}: hisob hali yozilmagan", { month: name });
  if (coverage.paid === 0) return t("{month}: to'lanmagan", { month: name });
  if (coverage.paid >= coverage.lessons) {
    return t("{month}: to'langan", { month: name });
  }
  return coverage.paidThrough
    ? t("{month}: {lessons} darsdan {paid} tasi to'langan ({date} gacha)", {
        month: name,
        lessons: coverage.lessons,
        paid: coverage.paid,
        date: formatShortDate(coverage.paidThrough),
      })
    : t("{month}: {lessons} darsdan {paid} tasi to'langan", {
        month: name,
        lessons: coverage.lessons,
        paid: coverage.paid,
      });
}

export interface AttendanceEntry {
  studentId: number;
  status: AttendanceStatus | null;
  note?: string;
}

export const DAY_NAMES: Record<number, string> = {
  0: msg("Yakshanba"),
  1: msg("Dushanba"),
  2: msg("Seshanba"),
  3: msg("Chorshanba"),
  4: msg("Payshanba"),
  5: msg("Juma"),
  6: msg("Shanba"),
};

/** The weekday name (a `msg()` text) of a 'YYYY-MM-DD' day, read off the date itself. */
export function dayNameOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return DAY_NAMES[new Date(y, m - 1, d).getDay()] ?? "";
}

export interface StatusOption {
  value: AttendanceStatus;
  label: string;
  icon: LucideIcon;
  color: string;
  activeColor: string;
  activeBg: string;
}

export const STATUS_CONFIG: StatusOption[] = [
  {
    value: "PRESENT",
    label: msg("Keldi"),
    icon: Check,
    color:
      "border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30",
    activeColor:
      "border-green-500 bg-green-500 text-white dark:border-green-500 dark:bg-green-600",
    activeBg: "",
  },
  {
    value: "ABSENT",
    label: msg("Kelmadi"),
    icon: X,
    color:
      "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30",
    activeColor:
      "border-red-500 bg-red-500 text-white dark:border-red-500 dark:bg-red-600",
    activeBg:
      "border-red-100 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20",
  },
  {
    value: "LATE",
    label: msg("Kechikdi"),
    icon: AlarmClock,
    color:
      "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30",
    activeColor:
      "border-amber-500 bg-amber-500 text-white dark:border-amber-500 dark:bg-amber-600",
    activeBg:
      "border-amber-100 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20",
  },
  {
    value: "EXCUSED",
    label: msg("Sababli"),
    icon: ShieldCheck,
    color:
      "border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30",
    activeColor:
      "border-blue-500 bg-blue-500 text-white dark:border-blue-500 dark:bg-blue-600",
    activeBg:
      "border-blue-100 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/20",
  },
];
