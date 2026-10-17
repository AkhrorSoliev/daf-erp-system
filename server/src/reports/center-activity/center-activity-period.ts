import { BadRequestException } from '@nestjs/common';
import {
  addMonthsToMonthKey,
  tashkentMonthKey,
  tashkentMonthRangeUtc,
} from '../../common/date/tashkent';

/** The report starts with the reporting base (ADR-0067): no month before it. */
export const CENTER_FIRST_MONTH = '2026-05';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `?oy=` → a month key inside [2026-05, the current Tashkent month]. Empty is the current month. */
export function parseCenterMonth(oy: string | undefined, now: Date): string {
  const current = tashkentMonthKey(now);
  if (!oy) return current;
  if (!MONTH.test(oy)) {
    throw new BadRequestException("Oy YYYY-MM ko'rinishida bo'lishi kerak");
  }
  if (oy < CENTER_FIRST_MONTH) {
    throw new BadRequestException('Bu hisobot may 2026 dan boshlanadi');
  }
  if (oy > current) {
    throw new BadRequestException("Kelajak oyni tanlab bo'lmaydi");
  }
  return oy;
}

/**
 * The instant a month is read at: its last millisecond, or `now` for a month
 * still running. Every figure of the page is the state AT this instant.
 */
export function asOfForMonth(month: string, now: Date): Date {
  const end = new Date(tashkentMonthRangeUtc(month).lt.getTime() - 1);
  return end.getTime() > now.getTime() ? now : end;
}

/** The bars of «Oylar bo'yicha»: up to `max` months ending at `month`, oldest first, none before the floor. */
export function monthsUpTo(month: string, max = 6): string[] {
  const out: string[] = [];
  for (let i = max - 1; i >= 0; i--) {
    const m = addMonthsToMonthKey(month, -i);
    if (m >= CENTER_FIRST_MONTH) out.push(m);
  }
  return out;
}
