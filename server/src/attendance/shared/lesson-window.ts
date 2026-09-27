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
