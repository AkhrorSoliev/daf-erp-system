/**
 * When a NEW register may be saved — the rule the server enforces in
 * `server/src/attendance/shared/attendance-window.ts` (spec 2026-09-29 §3.1):
 * only on the lesson's own Tashkent day, from ten minutes before it starts
 * until it ends, for every role. The server is the boundary; this only keeps
 * the form from offering a save the server will refuse.
 */
export type AttendanceWindow = "OPEN" | "BEFORE" | "ENDED" | "NOT_TODAY";

export const OPENS_MINUTES_BEFORE = 10;
export const DAY_END_TIME = "23:00";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function newAttendanceWindow(args: {
  date: string;
  todayStr: string;
  nowMinutes: number;
  startTime: string | null;
  endTime: string | null;
}): AttendanceWindow {
  if (args.date !== args.todayStr) return "NOT_TODAY";
  if (args.nowMinutes >= toMinutes(args.endTime ?? DAY_END_TIME)) return "ENDED";
  if (args.startTime && args.nowMinutes < toMinutes(args.startTime) - OPENS_MINUTES_BEFORE) {
    return "BEFORE";
  }
  return "OPEN";
}
