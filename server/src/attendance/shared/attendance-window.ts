import { TASHKENT_OFFSET_MS } from '../../common/date/tashkent';

/**
 * When a NEW register (no attendance rows yet) may be saved — spec
 * 2026-09-29 §3.1, ADR-0054: only on the lesson's own Tashkent day, from ten
 * minutes before it starts until it ends, for every role, the CEO included.
 * After the end the only way in is the late register, which leaves the
 * teacher unpaid for the lesson. Editing a register that already exists is
 * not governed by this.
 */
export type AttendanceWindow = 'OPEN' | 'BEFORE' | 'ENDED' | 'NOT_TODAY';

export const OPENS_MINUTES_BEFORE = 10;
/** A group without lesson times is treated as meeting 08:00–23:00. */
export const DAY_START_TIME = '08:00';
export const DAY_END_TIME = '23:00';

export const ENDED_REFUSAL =
  "Dars tugagan — davomat olish yopilgan. Dars bo'lgan-bo'lmaganini «Jadval» yoki «Topshiriqlar»da belgilang";

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** The Tashkent calendar day and minute-of-day of an instant. */
export function tashkentClock(now: Date = new Date()): {
  todayStr: string;
  nowMinutes: number;
} {
  const shifted = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  return {
    todayStr: shifted.toISOString().slice(0, 10),
    nowMinutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function newAttendanceWindow(args: {
  date: string;
  todayStr: string;
  nowMinutes: number;
  startTime: string | null;
  endTime: string | null;
}): AttendanceWindow {
  if (args.date !== args.todayStr) return 'NOT_TODAY';
  if (args.nowMinutes >= toMinutes(args.endTime ?? DAY_END_TIME))
    return 'ENDED';
  if (
    args.startTime &&
    args.nowMinutes < toMinutes(args.startTime) - OPENS_MINUTES_BEFORE
  ) {
    return 'BEFORE';
  }
  return 'OPEN';
}

export function lessonHasEnded(args: {
  date: string;
  todayStr: string;
  nowMinutes: number;
  endTime: string | null;
}): boolean {
  if (args.date !== args.todayStr) return args.date < args.todayStr;
  return args.nowMinutes >= toMinutes(args.endTime ?? DAY_END_TIME);
}

/** The Uzbek refusal for a closed window; `null` while it is open. */
export function windowRefusal(
  window: AttendanceWindow,
  args: { date: string; todayStr: string; startTime: string | null },
): string | null {
  switch (window) {
    case 'OPEN':
      return null;
    case 'BEFORE':
      return `Davomat dars boshlanishidan ${OPENS_MINUTES_BEFORE} daqiqa oldin ochiladi (${args.startTime})`;
    case 'NOT_TODAY':
      return args.date > args.todayStr
        ? 'Davomat faqat dars kuni olinadi. Kelmaydiganlarni «Oldindan belgilash» bilan belgilang'
        : ENDED_REFUSAL;
    case 'ENDED':
      return ENDED_REFUSAL;
  }
}
