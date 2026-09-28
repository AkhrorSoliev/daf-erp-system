import { tashkentNow } from "@/lib/tashkent-time";

/**
 * Mirror of the server's attendance window (ADR-0046,
 * `server/src/attendance/shared/lesson-window.ts`): it opens 10 minutes
 * before the lesson and closes when it ends, Tashkent time, for every role.
 * The server enforces it; this copy only drives the screen between fetches.
 */
export const WINDOW_OPENS_MINUTES_BEFORE = 10;

export type LessonWindowState = "before" | "open" | "closed";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function lessonWindowState(p: {
  lessonDay: string;
  startTime: string | null;
  endTime: string | null;
  now?: Date;
}): LessonWindowState {
  const now = tashkentNow(p.now ?? new Date());
  if (p.lessonDay < now.dateStr) return "closed";
  if (p.lessonDay > now.dateStr) return "before";
  if (!p.startTime || !p.endTime) return "open";
  if (now.minutes < toMinutes(p.startTime) - WINDOW_OPENS_MINUTES_BEFORE) {
    return "before";
  }
  if (now.minutes > toMinutes(p.endTime)) return "closed";
  return "open";
}

/** 'HH:MM' minus the opening lead, for the banner. */
export function windowOpensAt(startTime: string): string {
  const m = toMinutes(startTime) - WINDOW_OPENS_MINUTES_BEFORE;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
