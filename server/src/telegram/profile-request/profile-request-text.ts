import { Markup } from 'telegraf';
import { birthDateProblem } from '../../students/shared/student-onboarding';

export type ProfileField = 'gender' | 'dateOfBirth';

/** Har variantdagi o'zgarmas jumla: takror yuborishni to'xtatish kaliti. */
export const PROFILE_REQUEST_MARKER =
  'Shartnoma va ishtirok guvohnomasi kabi hujjatlar';

export const DATE_PROMPT =
  "Tug'ilgan sanangizni kun.oy.yil ko'rinishida yozing. Masalan: 15.03.2005";
export const GENDER_SAVED = '✅ Jinsingiz saqlandi.';
export const THANKS = "✅ Rahmat! Ma'lumotingiz saqlandi.";
export const ALREADY_FILLED = "Bu ma'lumot allaqachon kiritilgan. Rahmat!";
export const NOT_YOURS = 'Bu tugma sizning hisobingizga tegishli emas.';
export const PREVIEW_NOTE = "👁 Ko'rinish: hech narsa saqlanmadi.";
export const CANCELLED = 'Bekor qilindi.';
const DATE_FORMAT_HELP =
  "Sana kun.oy.yil ko'rinishida bo'lishi kerak. Masalan: 15.03.2005";

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function missingProfileFields(s: {
  gender: unknown;
  dateOfBirth: unknown;
}): ProfileField[] {
  const out: ProfileField[] = [];
  if (!s.gender) out.push('gender');
  if (!s.dateOfBirth) out.push('dateOfBirth');
  return out;
}

export function buildRequestText(
  firstName: string,
  missing: ProfileField[],
): string {
  const what =
    missing.length === 2
      ? "jinsingiz va tug'ilgan sanangiz"
      : missing[0] === 'gender'
        ? 'jinsingiz'
        : "tug'ilgan sanangiz";
  return (
    `Assalomu alaykum, ${esc(firstName)}!\n\n` +
    `Kartangizda ${what} yo'q. ${PROFILE_REQUEST_MARKER} to'g'ri tuzilishi uchun kerak.\n\n` +
    `Pastdagi tugmalar orqali kiriting — bir daqiqa. Rahmat!`
  );
}

export type ProfileAction =
  | { kind: 'gender'; studentId: number; gender: 'MALE' | 'FEMALE' }
  | { kind: 'date'; studentId: number }
  | { kind: 'preview'; step: 'gender' | 'date' };

export const profileCb = {
  gender: (id: number, g: 'MALE' | 'FEMALE') =>
    `pf:g:${id}:${g === 'MALE' ? 'M' : 'F'}`,
  date: (id: number) => `pf:d:${id}`,
  preview: (step: 'gender' | 'date') => `pf:p:${step === 'gender' ? 'g' : 'd'}`,
};

export function parseProfileCallback(data: string): ProfileAction | null {
  let m = /^pf:g:(\d+):([MF])$/.exec(data);
  if (m) {
    return {
      kind: 'gender',
      studentId: Number(m[1]),
      gender: m[2] === 'M' ? 'MALE' : 'FEMALE',
    };
  }
  m = /^pf:d:(\d+)$/.exec(data);
  if (m) return { kind: 'date', studentId: Number(m[1]) };
  m = /^pf:p:([gd])$/.exec(data);
  if (m) return { kind: 'preview', step: m[1] === 'g' ? 'gender' : 'date' };
  return null;
}

/** `target = 'preview'`: tugmalar hech narsa yozmaydi (`pf:p:*`). */
export function buildRequestKeyboard(
  target: number | 'preview',
  missing: ProfileField[],
) {
  const cb =
    target === 'preview'
      ? {
          male: profileCb.preview('gender'),
          female: profileCb.preview('gender'),
          date: profileCb.preview('date'),
        }
      : {
          male: profileCb.gender(target, 'MALE'),
          female: profileCb.gender(target, 'FEMALE'),
          date: profileCb.date(target),
        };
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  if (missing.includes('gender')) {
    rows.push([
      Markup.button.callback("👦 O'g'il", cb.male),
      Markup.button.callback('👧 Qiz', cb.female),
    ]);
  }
  if (missing.includes('dateOfBirth')) {
    rows.push([Markup.button.callback("📅 Tug'ilgan sanani yozish", cb.date)]);
  }
  return Markup.inlineKeyboard(rows);
}

export function parseBirthDateInput(
  text: string,
  today?: string,
): { ok: true; iso: string } | { ok: false; message: string } {
  const m = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(text);
  if (!m) return { ok: false, message: DATE_FORMAT_HELP };
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const problem = birthDateProblem(iso, today);
  return problem ? { ok: false, message: problem } : { ok: true, iso };
}
