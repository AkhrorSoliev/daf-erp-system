import { Markup } from 'telegraf';

export type ProfileField = 'gender' | 'dateOfBirth';

/** Har variantning yopuvchi jumlasida bor: takror yuborishni to'xtatish kaliti. */
export const PROFILE_REQUEST_MARKER = 'bosib kiriting. Rahmat!';

export const GENDER_SAVED = '✅ Jinsingiz saqlandi.';
export const DATE_SAVED = "✅ Tug'ilgan sanangiz saqlandi.";
export const THANKS = "✅ Rahmat! Ma'lumotingiz saqlandi.";
export const ALREADY_FILLED = "Bu ma'lumot allaqachon kiritilgan. Rahmat!";
export const NOT_YOURS = 'Bu tugma sizning hisobingizga tegishli emas.';
export const PREVIEW_NOTE = "👁 Ko'rinish: hech narsa saqlanmadi.";
export const CANCELLED = 'Bekor qilindi.';

/** Ko'rinish (preview) tugmalari shu raqam bilan keladi; haqiqiy karta raqami 10000 dan boshlanadi. */
export const PREVIEW_STUDENT_ID = 0;

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
  const both = missing.length === 2;
  const body = both
    ? "Jinsingiz va tug'ilgan sanangiz bizda yo'q. Tug'ilgan sana hujjatlaringiz (shartnoma, ishtirok guvohnomasi) xatosiz tayyorlanishi uchun, jins esa markaz hisobotlari uchun kerak."
    : missing[0] === 'gender'
      ? "Jinsingiz bizda yo'q. U markaz hisobotlari to'g'ri chiqishi uchun kerak."
      : "Tug'ilgan sanangiz bizda yo'q. Hujjatlaringiz (shartnoma, ishtirok guvohnomasi) xatosiz tayyorlanishi uchun kerak.";
  const closing = both
    ? 'Tugmalarni bosib kiriting. Rahmat!'
    : 'Tugmani bosib kiriting. Rahmat!';
  return `Assalomu alaykum, ${esc(firstName)}!\n\n${body}\n\n${closing}`;
}

export type ProfileAction =
  | { kind: 'gender'; studentId: number; gender: 'MALE' | 'FEMALE' }
  | { kind: 'date'; studentId: number }
  | { kind: 'decade'; studentId: number; decade: number }
  | { kind: 'year'; studentId: number; year: number }
  | { kind: 'month'; studentId: number; year: number; month: number }
  | { kind: 'confirm'; studentId: number; iso: string }
  | { kind: 'save'; studentId: number; iso: string }
  | { kind: 'cancel'; studentId: number }
  | { kind: 'preview' };

const two = (n: number) => String(n).padStart(2, '0');

export const profileCb = {
  gender: (id: number, g: 'MALE' | 'FEMALE') =>
    `pf:g:${id}:${g === 'MALE' ? 'M' : 'F'}`,
  date: (id: number) => `pf:d:${id}`,
  decade: (id: number, decade: number) => `pf:dd:${id}:${decade}`,
  year: (id: number, year: number) => `pf:dy:${id}:${year}`,
  month: (id: number, year: number, month: number) =>
    `pf:dm:${id}:${year}-${two(month)}`,
  confirm: (id: number, iso: string) => `pf:dc:${id}:${iso}`,
  save: (id: number, iso: string) => `pf:ds:${id}:${iso}`,
  cancel: (id: number) => `pf:x:${id}`,
  preview: () => 'pf:p:g',
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
  m = /^pf:dd:(\d+):(\d{4})$/.exec(data);
  if (m)
    return { kind: 'decade', studentId: Number(m[1]), decade: Number(m[2]) };
  m = /^pf:dy:(\d+):(\d{4})$/.exec(data);
  if (m) return { kind: 'year', studentId: Number(m[1]), year: Number(m[2]) };
  m = /^pf:dm:(\d+):(\d{4})-(\d{2})$/.exec(data);
  if (m) {
    return {
      kind: 'month',
      studentId: Number(m[1]),
      year: Number(m[2]),
      month: Number(m[3]),
    };
  }
  m = /^pf:dc:(\d+):(\d{4}-\d{2}-\d{2})$/.exec(data);
  if (m) return { kind: 'confirm', studentId: Number(m[1]), iso: m[2] };
  m = /^pf:ds:(\d+):(\d{4}-\d{2}-\d{2})$/.exec(data);
  if (m) return { kind: 'save', studentId: Number(m[1]), iso: m[2] };
  m = /^pf:x:(\d+)$/.exec(data);
  if (m) return { kind: 'cancel', studentId: Number(m[1]) };
  if (data === 'pf:p:g') return { kind: 'preview' };
  return null;
}

/** `target = 'preview'`: gender tugmalari hech narsa yozmaydi, sana tugmasi 0-raqamli kartada ishlaydi. */
export function buildRequestKeyboard(
  target: number | 'preview',
  missing: ProfileField[],
) {
  const cb =
    target === 'preview'
      ? {
          male: profileCb.preview(),
          female: profileCb.preview(),
          date: profileCb.date(PREVIEW_STUDENT_ID),
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
    rows.push([Markup.button.callback('📅 Sanani kiritish', cb.date)]);
  }
  return Markup.inlineKeyboard(rows);
}
