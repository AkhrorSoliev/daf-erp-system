import { AttendanceStatus } from '@prisma/client';
import { formatSom } from '../payments/shared/format-som';

/**
 * The ONE place that counts a student's level and decides whether a
 * Teilnahmebestätigung may be given (spec 3.1–3.3). The preview, the issue
 * endpoint and the PDF all read what this file returns; no other file keeps a
 * second copy of a count or of a threshold comparison.
 */

export const GER_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type GerLevel = (typeof GER_LEVELS)[number];

/** The levels the Student App has (or will have) material for. */
export const APP_LEVELS = ['A1', 'A2', 'B1'] as const;
export type AppLevel = (typeof APP_LEVELS)[number];

/** `Group.level` is free text; only the six GER levels count. */
export function normalizeLevel(
  raw: string | null | undefined,
): GerLevel | null {
  const value = (raw ?? '').trim().toUpperCase();
  return (GER_LEVELS as readonly string[]).includes(value)
    ? (value as GerLevel)
    : null;
}

export function isAppLevel(level: string): level is AppLevel {
  return (APP_LEVELS as readonly string[]).includes(level);
}

export interface AttendanceRow {
  status: AttendanceStatus;
  cancellationId: string | null;
  /** A `PlannedAbsence` of kind SABABSIZ exists for this group and day. */
  plannedUnexcused: boolean;
}

export interface AttendanceTally {
  attended: number;
  late: number;
  absent: number;
  counted: number;
  /** Floored, so the screen never shows more than the student earned. */
  percent: number | null;
}

export function tallyAttendance(
  rows: readonly AttendanceRow[],
): AttendanceTally {
  let attended = 0;
  let late = 0;
  let absent = 0;
  for (const r of rows) {
    switch (r.status) {
      case AttendanceStatus.PRESENT:
        attended += 1;
        break;
      case AttendanceStatus.LATE:
        attended += 1;
        late += 1;
        break;
      case AttendanceStatus.ABSENT:
        absent += 1;
        break;
      case AttendanceStatus.EXCUSED:
        // A cancelled lesson is nobody's absence; an announced «sababsiz»
        // absence lands as EXCUSED but is not excused (AbsenceStreakService
        // reads it the same way).
        if (r.cancellationId === null && r.plannedUnexcused) absent += 1;
        break;
    }
  }
  const counted = attended + absent;
  return {
    attended,
    late,
    absent,
    counted,
    percent: counted > 0 ? Math.floor((attended * 100) / counted) : null,
  };
}

export interface AppTally {
  applies: boolean;
  done: number;
  open: number;
  percent: number | null;
}

export function tallyApp(done: number, open: number): AppTally {
  if (open <= 0) return { applies: false, done: 0, open: 0, percent: null };
  const d = Math.min(Math.max(done, 0), open);
  return {
    applies: true,
    done: d,
    open,
    percent: Math.floor((d * 100) / open),
  };
}

export interface Thresholds {
  attendance: number;
  /** null: this level has no app threshold (not A1/A2/B1). */
  app: number | null;
  /** `counted` lessons (attended + absent) the level needs at least. */
  minLessons: number;
  /** Most late lessons, as a percent of the lessons attended. */
  maxLatePercent: number;
}

export interface UnitTestTally {
  passed: number;
  total: number;
}

/** What `evaluate` needs besides the two tallies: facts of the student. */
export interface VerdictFacts {
  /** `Student.balance`: negative is a debt. */
  balance: number;
  /** Open final (unit) tests of the level; null when the level has none. */
  unitTests: UnitTestTally | null;
}

/** `numerator / denominator ≥ minPercent`, in integers: 79,6 % never passes 80. */
export function meetsPercent(
  numerator: number,
  denominator: number,
  minPercent: number,
): boolean {
  return denominator > 0 && numerator * 100 >= minPercent * denominator;
}

export interface Verdict {
  attendanceOk: boolean;
  /** null: the app condition does not apply to this level. */
  appOk: boolean | null;
  /** No debt: `Student.balance` is not negative. */
  debtOk: boolean;
  /** `counted` reaches the minimum number of lessons. */
  lessonsOk: boolean;
  /** `late × 100 ≤ maxLatePercent × attended`, in integers. */
  lateOk: boolean;
  /** Share of the attended lessons that were late, rounded UP; null when none attended. */
  latePercent: number | null;
  /** null: the level has no final tests, so there is nothing to require. */
  testsOk: boolean | null;
  eligible: boolean;
  reasons: string[];
}

export function evaluate(
  attendance: AttendanceTally,
  app: AppTally,
  thresholds: Thresholds,
  facts: VerdictFacts,
): Verdict {
  const attendanceOk = meetsPercent(
    attendance.attended,
    attendance.counted,
    thresholds.attendance,
  );
  const debtOk = facts.balance >= 0;
  const lessonsOk = attendance.counted >= thresholds.minLessons;
  // Integers only; with nothing attended there is no late lesson either, and
  // the attendance rule has already failed.
  const lateOk =
    attendance.late * 100 <= thresholds.maxLatePercent * attendance.attended;
  const latePercent =
    attendance.attended > 0
      ? Math.ceil((attendance.late * 100) / attendance.attended)
      : null;
  const tests = facts.unitTests;
  const testsOk = tests && tests.total > 0 ? tests.passed >= tests.total : null;
  // The app part counts only when the level has an app threshold AND open
  // lessons: A2/B1 can have a threshold with no content yet.
  const appMin = app.applies ? thresholds.app : null;
  const appOk =
    appMin !== null ? meetsPercent(app.done, app.open, appMin) : null;

  const reasons: string[] = [];
  if (!attendanceOk) {
    reasons.push(
      attendance.counted === 0
        ? "Davomat ma'lumoti yo'q"
        : `Davomat ${attendance.percent}%, kerak ${thresholds.attendance}%`,
    );
  }
  if (!lessonsOk) {
    reasons.push(
      `Darslar soni ${attendance.counted} ta, kamida ${thresholds.minLessons} ta kerak`,
    );
  }
  if (!lateOk) {
    reasons.push(
      `Kech qolish ${latePercent}%, ruxsat etilgani ${thresholds.maxLatePercent}%`,
    );
  }
  if (appOk === false) {
    reasons.push(`Ilova ${app.percent}%, kerak ${thresholds.app}%`);
  }
  if (testsOk === false && tests) {
    reasons.push(
      `Yakuniy sinovlar ${tests.passed}/${tests.total} ta topshirilgan, hammasi kerak`,
    );
  }
  if (!debtOk) {
    reasons.push(`Qarzi bor: ${formatSom(-facts.balance)} so'm`);
  }
  return {
    attendanceOk,
    appOk,
    debtOk,
    lessonsOk,
    lateOk,
    latePercent,
    testsOk,
    eligible:
      attendanceOk &&
      appOk !== false &&
      debtOk &&
      lessonsOk &&
      lateOk &&
      testsOk !== false,
    reasons,
  };
}
