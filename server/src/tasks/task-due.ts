import { BadRequestException } from '@nestjs/common';
import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
  TASHKENT_OFFSET_MS,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';

export const DEFAULT_DUE_HOUR = 18;
const WORK_START = 8;
const WORK_END = 22;

/** 18:00 Tashkent on `dateStr`, as the stored UTC instant. */
export function defaultDueAt(dateStr: string): Date {
  return new Date(
    utcMidnightFromDateStr(dateStr).getTime() +
      DEFAULT_DUE_HOUR * 3_600_000 -
      TASHKENT_OFFSET_MS,
  );
}

function tashkentParts(d: Date) {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return {
    dateStr: tashkentDateStr(d),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
  };
}

/** Manual tasks: 08:00–22:00, never Sunday, never a holiday of the task's branch. */
export function assertManualDueAt(
  dueAt: Date,
  holidays: ReadonlySet<string>,
): void {
  const { dateStr, hour, minute } = tashkentParts(dueAt);
  if (dayOfWeekForDateStr(dateStr) === 0) {
    throw new BadRequestException("Muddat yakshanba kuniga qo'yilmaydi");
  }
  if (holidays.has(dateStr)) {
    throw new BadRequestException("Muddat bayram kuniga qo'yilmaydi");
  }
  const tooEarly = hour < WORK_START;
  const tooLate = hour > WORK_END || (hour === WORK_END && minute > 0);
  if (tooEarly || tooLate) {
    throw new BadRequestException(
      "Muddat 08:00 dan 22:00 gacha bo'lishi kerak (Toshkent vaqti)",
    );
  }
}

/** System tasks: a Sunday/holiday due moves to the next working day, same time of day. */
export function shiftSystemDueAt(
  dueAt: Date,
  holidays: ReadonlySet<string>,
): Date {
  let dateStr = tashkentDateStr(dueAt);
  const timeOfDay =
    dueAt.getTime() -
    (utcMidnightFromDateStr(dateStr).getTime() - TASHKENT_OFFSET_MS);
  while (dayOfWeekForDateStr(dateStr) === 0 || holidays.has(dateStr)) {
    dateStr = addDaysToDateStr(dateStr, 1);
  }
  return new Date(
    utcMidnightFromDateStr(dateStr).getTime() - TASHKENT_OFFSET_MS + timeOfDay,
  );
}
