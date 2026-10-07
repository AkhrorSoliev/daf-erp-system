import { BadRequestException } from '@nestjs/common';
import { isCalendarDateStr } from '../common/date/tashkent';
import { defaultDueAt } from './task-due';

/** An ISO instant: date, `T`, time and a zone (`Z` or `±hh:mm`). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/;

/**
 * A bare `YYYY-MM-DD` day → 18:00 Tashkent; an ISO instant as is; empty → no due.
 * Anything else (a loose `Date.parse` string, a time without a zone, a
 * non-string) is a 400: `new Date` would read a zone-less time in the PROCESS
 * timezone (UTC on Railway), i.e. guess which timezone was meant.
 */
export function parseDueInput(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') {
    throw new BadRequestException("Muddat noto'g'ri");
  }
  if (isCalendarDateStr(raw)) return defaultDueAt(raw);
  const d = new Date(raw);
  if (!ISO_INSTANT.test(raw) || Number.isNaN(d.getTime())) {
    throw new BadRequestException("Muddat noto'g'ri");
  }
  return d;
}

/** Trimmed text, or a 400: the DTOs trim too, but Telegram and other callers skip them. */
export function requireText(raw: string, message: string): string {
  const text = raw.trim();
  if (!text) throw new BadRequestException(message);
  return text;
}
