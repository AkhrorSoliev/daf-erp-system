import { tashkentNow } from "@/lib/tashkent-time";

/**
 * Mirror of the server's attendance window (ADR-0046,
 * `server/src/attendance/shared/lesson-window.ts`): it opens some minutes
 * before the lesson (the company's setting, sent with the roster's `window`;
 * 10 by default) and closes when it ends, Tashkent time, for every role.
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
  /** The company's lead from the server; 10 when not known yet. */
  opensMinutesBefore?: number;
  now?: Date;
}): LessonWindowState {
  const now = tashkentNow(p.now ?? new Date());
  if (p.lessonDay < now.dateStr) return "closed";
  if (p.lessonDay > now.dateStr) return "before";
  if (!p.startTime || !p.endTime) return "open";
  const lead = p.opensMinutesBefore ?? WINDOW_OPENS_MINUTES_BEFORE;
  if (now.minutes < toMinutes(p.startTime) - lead) {
    return "before";
  }
  if (now.minutes > toMinutes(p.endTime)) return "closed";
  return "open";
}

/** 'HH:MM' minus the opening lead, for the banner. */
export function windowOpensAt(
  startTime: string,
  opensMinutesBefore: number = WINDOW_OPENS_MINUTES_BEFORE,
): string {
  const m = Math.max(0, toMinutes(startTime) - opensMinutesBefore);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
