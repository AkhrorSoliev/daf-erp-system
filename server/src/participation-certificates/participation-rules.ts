import { AttendanceStatus } from '@prisma/client';

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
  eligible: boolean;
  reasons: string[];
}

export function evaluate(
  attendance: AttendanceTally,
  app: AppTally,
  thresholds: Thresholds,
): Verdict {
  const attendanceOk = meetsPercent(
    attendance.attended,
    attendance.counted,
    thresholds.attendance,
  );
  const appRequired = app.applies && thresholds.app !== null;
  const appOk = appRequired
    ? meetsPercent(app.done, app.open, thresholds.app ?? 0)
    : null;

  const reasons: string[] = [];
  if (!attendanceOk) {
    reasons.push(
      attendance.counted === 0
        ? "Davomat ma'lumoti yo'q"
        : `Davomat ${attendance.percent}%, kerak ${thresholds.attendance}%`,
    );
  }
  if (appOk === false) {
    reasons.push(`Ilova ${app.percent}%, kerak ${thresholds.app}%`);
  }
  return {
    attendanceOk,
    appOk,
    eligible: attendanceOk && appOk !== false,
    reasons,
  };
}
