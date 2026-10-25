import { Markup } from 'telegraf';
import {
  MAX_STUDENT_AGE,
  MIN_STUDENT_AGE,
} from '../../students/shared/student-onboarding';

/**
 * Tug'ilgan sana tugmalari: holat faqat callback_data'da (sessiya ham, scene ham yo'q).
 * Bu fayl toza: matn va klaviatura quradi, bazaga tegmaydi.
 */

export const YEAR_PROMPT = "Tug'ilgan yilingizni tanlang:";
const BACK = '⬅️ Orqaga';
const CANCEL = 'Bekor qilish';

export const MONTHS_UZ = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
] as const;

type Btn = ReturnType<typeof Markup.button.callback>;
export interface PickerScreen {
  text: string;
  keyboard: ReturnType<typeof Markup.inlineKeyboard>;
}

const two = (n: number) => String(n).padStart(2, '0');

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `YYYY-MM-DD` haqiqiy kalendar kuni bo'lsagina true. */
export function isRealIsoDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

/** Tanlash mumkin bo'lgan tug'ilgan yillar (`today` = Toshkent sanasi, YYYY-MM-DD). */
export function validYearRange(today: string): { min: number; max: number } {
  const y = Number(today.slice(0, 4));
  return { min: y - MAX_STUDENT_AGE, max: y - MIN_STUDENT_AGE };
}

/** O'n yilliklar boshi, eng yangisi birinchi. */
export function decadeStarts(today: string): number[] {
  const { min, max } = validYearRange(today);
  const out: number[] = [];
  for (
    let d = Math.floor(max / 10) * 10;
    d >= Math.floor(min / 10) * 10;
    d -= 10
  )
    out.push(d);
  return out;
}

export function yearsOfDecade(today: string, decade: number): number[] {
  const { min, max } = validYearRange(today);
  const out: number[] = [];
  for (let y = Math.max(decade, min); y <= Math.min(decade + 9, max); y++)
    out.push(y);
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    rows.push(items.slice(i, i + size));
  return rows;
}

const cancelBtn = (): Btn => Markup.button.callback(CANCEL, 'pf:x');
const backRow = (cb: string): Btn[] => [
  Markup.button.callback(BACK, cb),
  cancelBtn(),
];

export function decadesScreen(studentId: number, today: string): PickerScreen {
  const btns = decadeStarts(today).map((d) =>
    Markup.button.callback(`${d}–${d + 9}`, `pf:dd:${studentId}:${d}`),
  );
  return {
    text: YEAR_PROMPT,
    keyboard: Markup.inlineKeyboard([...chunk(btns, 2), [cancelBtn()]]),
  };
}

export function yearsScreen(
  studentId: number,
  decade: number,
  today: string,
): PickerScreen {
  const btns = yearsOfDecade(today, decade).map((y) =>
    Markup.button.callback(String(y), `pf:dy:${studentId}:${y}`),
  );
  return {
    text: 'Yilni tanlang:',
    keyboard: Markup.inlineKeyboard([
      ...chunk(btns, 5),
      backRow(`pf:d:${studentId}`),
    ]),
  };
}

export function monthsScreen(studentId: number, year: number): PickerScreen {
  const btns = MONTHS_UZ.map((name, i) =>
    Markup.button.callback(name, `pf:dm:${studentId}:${year}-${two(i + 1)}`),
  );
  const decade = Math.floor(year / 10) * 10;
  return {
    text: 'Oyni tanlang:',
    keyboard: Markup.inlineKeyboard([
      ...chunk(btns, 3),
      backRow(`pf:dd:${studentId}:${decade}`),
    ]),
  };
}

export function daysScreen(
  studentId: number,
  year: number,
  month: number,
): PickerScreen {
  const btns: Btn[] = [];
  for (let d = 1; d <= daysInMonth(year, month); d++)
    btns.push(
      Markup.button.callback(
        String(d),
        `pf:dc:${studentId}:${year}-${two(month)}-${two(d)}`,
      ),
    );
  return {
    text: 'Kunni tanlang:',
    keyboard: Markup.inlineKeyboard([
      ...chunk(btns, 7),
      backRow(`pf:dy:${studentId}:${year}`),
    ]),
  };
}

export function confirmScreen(studentId: number, iso: string): PickerScreen {
  const [y, m, d] = iso.split('-').map(Number);
  return {
    text: `Tug'ilgan sana: ${d}-${MONTHS_UZ[m - 1].toLowerCase()}, ${y}. To'g'rimi?`,
    keyboard: Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Ha, saqlash', `pf:ds:${studentId}:${iso}`),
        Markup.button.callback('↩️ Qaytadan', `pf:d:${studentId}`),
      ],
      backRow(`pf:dm:${studentId}:${y}-${two(m)}`),
    ]),
  };
}

/** Qayta tanlash tugmasi (sana qoidaga to'g'ri kelmaganda). */
export function retryKeyboard(studentId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('↩️ Qaytadan', `pf:d:${studentId}`)],
  ]);
}
