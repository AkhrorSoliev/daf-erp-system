import type { Day } from './statement.types';

const MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];
const NBSP = '\u00a0';

/** 'sentabr' for '2026-09' or '2026-09-19'. */
export const monthName = (keyOrDay: string): string =>
  MONTHS[Number(keyOrDay.slice(5, 7)) - 1];

export const capitalize = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);

/** 'Sentabr'. */
export const monthTitle = (keyOrDay: string): string =>
  capitalize(monthName(keyOrDay));

/**
 * '19-sentabr', with a no-break hyphen so a line never breaks between the
 * day and the month ("19-" / "sentabrdan").
 */
export const dayName = (day: Day): string =>
  `${Number(day.slice(8, 10))}\u2011${monthName(day)}`;

/** '19.09.2026'. */
export const dmy = (day: Day): string =>
  `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

/** '19.09'. */
export const dm = (day: Day): string =>
  `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** 254156 → '254 156' (no-break space). Display only: the sign is dropped. */
export const som = (n: number): string =>
  String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

/** '+33 345', '−254 156', '0'. */
export const signed = (n: number): string =>
  (n > 0 ? '+' : n < 0 ? '−' : '') + som(n);

export const METHOD_LABEL: Record<string, string> = {
  CASH: 'Naqd',
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
  TRANSFER: "O'tkazma",
};
