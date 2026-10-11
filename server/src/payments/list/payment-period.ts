import { BadRequestException } from '@nestjs/common';
import { isCalendarDateStr } from '../../common/date/tashkent';
import {
  resolvePeriod,
  type ResolvedPeriod,
} from '../../common/finance/period-helpers';
import { periodShape } from './part-labels';

/** The system's reporting floor; the page shows nothing before it (spec B4 §3.3). */
export const PAYMENTS_FLOOR_DAY = '2026-05-01';

/** The page's period, both ends required, checked in this order (spec B4 §4.1). */
export function parsePaymentPeriod(
  startDate?: string,
  endDate?: string,
): ResolvedPeriod {
  if (!startDate || !endDate) {
    throw new BadRequestException('Davr boshi va oxiri kerak');
  }
  if (!isCalendarDateStr(startDate) || !isCalendarDateStr(endDate)) {
    throw new BadRequestException("Bunday sana kalendarda yo'q");
  }
  if (startDate > endDate) {
    throw new BadRequestException(
      "Davr boshi oxiridan keyin bo'lishi mumkin emas",
    );
  }
  if (startDate < PAYMENTS_FLOOR_DAY) {
    throw new BadRequestException(
      "To'lovlar 01.05.2026 dan boshlab ko'rsatiladi",
    );
  }
  return resolvePeriod(startDate, endDate);
}

export interface PeriodView {
  start: string;
  end: string;
  singleMonth: boolean;
  endsOnMonthEnd: boolean;
}

export function periodView(p: ResolvedPeriod): PeriodView {
  const { singleMonth, endsOnMonthEnd } = periodShape(p.startStr, p.endStr);
  return { start: p.startStr, end: p.endStr, singleMonth, endsOnMonthEnd };
}
