import {
  TASHKENT_OFFSET_MS,
  tashkentDateStr,
} from '../../common/date/tashkent';

/**
 * The attendance window of one lesson (ADR-0045). It opens 10 minutes before
 * the lesson starts and closes when the lesson ends, Tashkent time. Every
 * role is bound by it — teacher, administrator, branch director and CEO
 * alike; after the end nobody on the site may enter or change attendance.
 */
export const WINDOW_OPENS_MINUTES_BEFORE = 10;

export type LessonWindowState = 'before' | 'open' | 'closed';

export interface LessonTimes {
  /** Tashkent 'YYYY-MM-DD'. */
  lessonDay: string;
  /** 'HH:MM', the effective start: a reschedule's override wins. */
  startTime: string | null;
  endTime: string | null;
}

export interface LessonWindow {
  state: LessonWindowState;
  startTime: string | null;
  endTime: string | null;
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const ddmmyyyy = (day: string): string =>
  `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

export function lessonWindowState(
  input: LessonTimes & { now: Date },
): LessonWindowState {
  const today = tashkentDateStr(input.now);
  if (input.lessonDay < today) return 'closed';
  if (input.lessonDay > today) return 'before';
  // A group without lesson times has no window inside its day to enforce.
  if (!input.startTime || !input.endTime) return 'open';
  const shifted = new Date(input.now.getTime() + TASHKENT_OFFSET_MS);
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  if (minutes < toMinutes(input.startTime) - WINDOW_OPENS_MINUTES_BEFORE) {
    return 'before';
  }
  if (minutes > toMinutes(input.endTime)) return 'closed';
  return 'open';
}

/** The message a refused write carries. */
export function windowRefusal(
  state: 'before' | 'closed',
  lesson: LessonTimes,
  now: Date,
): string {
  if (state === 'closed') {
    const at = lesson.endTime
      ? `${ddmmyyyy(lesson.lessonDay)}, ${lesson.endTime}`
      : ddmmyyyy(lesson.lessonDay);
    return `Dars tugagan (${at}). Davomat yopilgan — endi uni saytda kiritib bo'lmaydi`;
  }
  if (lesson.lessonDay === tashkentDateStr(now) && lesson.startTime) {
    return `Davomat dars boshlanishidan ${WINDOW_OPENS_MINUTES_BEFORE} daqiqa oldin ochiladi (${lesson.startTime})`;
  }
  return `Bu dars hali boshlanmagan (${ddmmyyyy(lesson.lessonDay)}). Davomat dars kuni ochiladi`;
}

/**
 * Whole minutes from the lesson's effective start to `now`, Tashkent time;
 * null when the lesson has no start time or `now` is not past the start of
 * that day's lesson. Used for «N daqiqa kechikdi» (ADR-0046).
 */
export function minutesLate(
  input: Pick<LessonTimes, 'lessonDay' | 'startTime'> & { now: Date },
): number | null {
  if (!input.startTime) return null;
  const [h, m] = input.startTime.split(':').map(Number);
  const startUtcMs =
    Date.parse(`${input.lessonDay}T00:00:00.000Z`) -
    TASHKENT_OFFSET_MS +
    (h * 60 + m) * 60_000;
  const minutes = Math.floor((input.now.getTime() - startUtcMs) / 60_000);
  return minutes > 0 ? minutes : null;
}

/** Statuses that say the student is in the lesson. */
const IN_LESSON = new Set(['PRESENT', 'LATE']);

/**
 * The status and minutes a manual save writes for one student (ADR-0046).
 * An administrator marking a student present after the lesson's first save
 * is recording a late arrival: the student becomes LATE with the minutes
 * since the start. A LATE that stays LATE keeps its minutes; any other
 * status clears them. A teacher's save, the lesson's first save, and a
 * student already in the lesson are written as sent.
 */
export function lateArrival(input: {
  lessonAlreadyTaken: boolean;
  savedByTeacherOnly: boolean;
  oldStatus: string | null;
  oldLateMinutes: number | null;
  newStatus: string;
  /** `minutesLate` at the moment of the save. */
  minutesNow: number | null;
}): { status: string; lateMinutes: number | null } {
  const arriving =
    input.lessonAlreadyTaken &&
    !input.savedByTeacherOnly &&
    !IN_LESSON.has(input.oldStatus ?? '') &&
    IN_LESSON.has(input.newStatus);
  if (arriving && input.minutesNow !== null) {
    return { status: 'LATE', lateMinutes: input.minutesNow };
  }
  if (input.newStatus !== 'LATE') {
    return { status: input.newStatus, lateMinutes: null };
  }
  return {
    status: 'LATE',
    lateMinutes: input.oldStatus === 'LATE' ? input.oldLateMinutes : null,
  };
}
