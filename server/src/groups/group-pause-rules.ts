import { BadRequestException } from '@nestjs/common';
import { GroupStatus } from '@prisma/client';
import { isCalendarDateStr } from '../common/date/tashkent';

/** What the pause and resume dialogs send (ADR-0119, §1a–1b). */
export interface PauseInput {
  status: GroupStatus;
  plannedResumeOn?: string;
  resumeUnknown?: boolean;
  resumeOn?: string;
}

export type PauseDecision =
  | { kind: 'pause'; plannedResumeOn: string | null }
  | { kind: 'resume-now'; resumeOn: string }
  | { kind: 'resume-later'; resumeOn: string }
  | { kind: 'other' };

export const PLANNED_DATE_REQUIRED =
  "Darslar qachondan qayta boshlanishini tanlang yoki «Hozircha noma'lum» ni belgilang";
export const RESUME_DATE_REQUIRED =
  'Guruhni pauzadan chiqarish uchun darslar qaysi kundan boshlanishini tanlang';

function requireDay(value: string, message: string): string {
  if (!isCalendarDateStr(value)) throw new BadRequestException(message);
  return value;
}

/**
 * Reads the pause fields of a status change. `today` is a Tashkent
 * `YYYY-MM-DD`. A pause needs the planned restart day or an explicit
 * "unknown"; a resume needs the day lessons restart, today or later. Any
 * other status ignores the fields.
 */
export function decidePauseChange(
  from: GroupStatus,
  input: PauseInput,
  today: string,
): PauseDecision {
  if (input.status === GroupStatus.PAUSED && from !== GroupStatus.PAUSED) {
    const hasDay = Boolean(input.plannedResumeOn);
    if (hasDay === Boolean(input.resumeUnknown)) {
      throw new BadRequestException(PLANNED_DATE_REQUIRED);
    }
    if (!hasDay) return { kind: 'pause', plannedResumeOn: null };
    const day = requireDay(input.plannedResumeOn!, PLANNED_DATE_REQUIRED);
    if (day <= today) {
      throw new BadRequestException(
        "Qayta boshlanish sanasi bugundan keyin bo'lishi kerak",
      );
    }
    return { kind: 'pause', plannedResumeOn: day };
  }

  if (from === GroupStatus.PAUSED && input.status === GroupStatus.ACTIVE) {
    if (!input.resumeOn) throw new BadRequestException(RESUME_DATE_REQUIRED);
    const day = requireDay(input.resumeOn, RESUME_DATE_REQUIRED);
    if (day < today) {
      throw new BadRequestException(
        "Qayta boshlanish sanasi o'tib ketgan kun bo'lishi mumkin emas",
      );
    }
    return day === today
      ? { kind: 'resume-now', resumeOn: day }
      : { kind: 'resume-later', resumeOn: day };
  }

  return { kind: 'other' };
}
