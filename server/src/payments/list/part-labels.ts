import {
  addDaysToDateStr,
  addMonthsToMonthKey,
} from '../../common/date/tashkent';
import type { PaymentParts } from '../../common/finance/income-attribution';
import {
  capitalizeUz,
  uzMonthName,
} from '../../telegram-digest/uzbek-calendar';

/** Row pill labels follow the selected period (spec B4 §4.4, CEO 11.10.2026). */
export interface PeriodShape {
  startMonth: string;
  endMonth: string;
  singleMonth: boolean;
  endsOnMonthEnd: boolean;
}
export function periodShape(startStr: string, endStr: string): PeriodShape {
  const startMonth = startStr.slice(0, 7);
  const endMonth = endStr.slice(0, 7);
  return {
    startMonth,
    endMonth,
    singleMonth: startMonth === endMonth,
    endsOnMonthEnd: addDaysToDateStr(endStr, 1).slice(8, 10) === '01',
  };
}
export function monthWord(monthKey: string, currentYear: string): string {
  const name = capitalizeUz(uzMonthName(Number(monthKey.slice(5, 7))));
  return monthKey.slice(0, 4) === currentYear
    ? name
    : `${name} ${monthKey.slice(0, 4)}`;
}
export type PartKind = 'CURRENT' | 'ADVANCE' | 'LATE';
export interface PartView {
  kind: PartKind;
  monthKey: string | null;
  label: string;
  amount: number;
}
export function partViews(
  parts: PaymentParts,
  shape: PeriodShape,
  currentYear: string,
): PartView[] {
  const out: PartView[] = parts.late.map((l) => ({
    kind: 'LATE',
    monthKey: l.monthKey,
    label: `${monthWord(l.monthKey, currentYear)} qarzi`,
    amount: l.amount,
  }));
  if (parts.currentMonth > 0) {
    out.push(
      shape.singleMonth
        ? {
            kind: 'CURRENT',
            monthKey: shape.startMonth,
            label: `${monthWord(shape.startMonth, currentYear)} to'lovi`,
            amount: parts.currentMonth,
          }
        : {
            kind: 'CURRENT',
            monthKey: null,
            label: "Shu davr to'lovi",
            amount: parts.currentMonth,
          },
    );
  }
  if (parts.advance > 0) {
    const next = addMonthsToMonthKey(shape.endMonth, 1);
    out.push(
      shape.endsOnMonthEnd
        ? {
            kind: 'ADVANCE',
            monthKey: next,
            label: `${monthWord(next, currentYear)} uchun oldindan`,
            amount: parts.advance,
          }
        : {
            kind: 'ADVANCE',
            monthKey: null,
            label: 'Oldindan (balansda)',
            amount: parts.advance,
          },
    );
  }
  return out;
}
