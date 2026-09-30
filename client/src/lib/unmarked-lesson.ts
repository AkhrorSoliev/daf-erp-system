/** «Dars bo'ldimi?» — spec 2026-09-29, ADR-0054. */
export type UnmarkedStatus = "PENDING" | "HELD" | "NOT_HELD" | "RESCHEDULED";

export interface UnmarkedLessonInfo {
  id: string;
  status: UnmarkedStatus;
  claimedBy: { id: number; firstName: string; lastName: string } | null;
}

/** The lesson a prompt asks about. */
export interface UnmarkedLessonRef {
  groupId: string;
  groupName: string;
  date: string; // YYYY-MM-DD
  startTime: string | null;
  endTime: string | null;
}

export interface AnswerState {
  /** Draw the prompt at all. */
  visible: boolean;
  /** Buttons enabled. */
  canAnswer: boolean;
  /** Another administrator took the task. */
  heldBy: string | null;
  /** CEO: «Ustoz aybdor emas — haq yozilsin». */
  canExempt: boolean;
}

interface Viewer {
  id: number;
  roles: { id: number }[];
}

const HIDDEN: AnswerState = { visible: false, canAnswer: false, heldBy: null, canExempt: false };

/**
 * Who sees the question and who may answer it (spec §3.3): administrators
 * while nobody has taken the task, the one who took it, and directors and the
 * CEO always. The server enforces the same; this decides what to draw.
 */
export function answerState(
  info: UnmarkedLessonInfo | null | undefined,
  viewer: Viewer | null | undefined,
): AnswerState {
  if (!info || info.status !== "PENDING" || !viewer) return HIDDEN;
  const roleIds = new Set(viewer.roles.map((r) => r.id));
  const isManager = roleIds.has(1) || roleIds.has(2);
  if (!isManager && !roleIds.has(3)) return HIDDEN;
  const other = info.claimedBy && info.claimedBy.id !== viewer.id ? info.claimedBy : null;
  return {
    visible: true,
    canAnswer: isManager || other === null,
    heldBy: other ? `${other.firstName} ${other.lastName}` : null,
    canExempt: roleIds.has(1),
  };
}

export function formatLessonDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

/** A make-up lesson must still be ahead, or nobody could mark it either. */
export function makeUpIsAhead(
  dateStr: string,
  startTime: string,
  now: { dateStr: string; minutes: number },
): boolean {
  if (dateStr !== now.dateStr) return dateStr > now.dateStr;
  const [h, m] = startTime.split(":").map(Number);
  return h * 60 + m > now.minutes;
}
