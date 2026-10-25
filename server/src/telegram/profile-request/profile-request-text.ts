import { Markup } from 'telegraf';

export type ProfileField = 'gender' | 'dateOfBirth';

/** Yagona so'rov xabarining o'zgarmas jumlasi: takror yuborishni to'xtatish kaliti. */
export const PROFILE_REQUEST_MARKER = 'Pastdagi tugmani bosing';

export const THANKS = "✅ Rahmat! Ma'lumotingiz saqlandi.";
export const ALREADY_FILLED = "Bu ma'lumot allaqachon kiritilgan. Rahmat!";
export const NOT_YOURS = 'Bu tugma sizning hisobingizga tegishli emas.';
export const PREVIEW_NOTE = "👁 Ko'rinish: hech narsa saqlanmadi.";

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

/** Hamma uchun bitta matn: qaysi maydon yetishmasligi aytilmaydi. */
export function buildRequestText(firstName: string): string {
  return (
    `Assalomu alaykum, ${esc(firstName)}! 😊\n\n` +
    "Markazimizda siz haqingizda ba'zi ma'lumotlar yetishmayapti. Ular bizning statistikamiz uchun kerak edi, o'quvchilarimizni yaxshiroq tushunishga yordam beradi.\n\n" +
    `${PROFILE_REQUEST_MARKER}, bir necha soniya vaqtingizni oladi. Rahmat! 🙏`
  );
}

/** Tanlangan jins: M, F yoki N (jins so'ralmaydi — kartada bor). */
export type GenderChoice = 'M' | 'F' | 'N';

export type ProfileAction =
  | { kind: 'start'; studentId: number }
  | { kind: 'gender'; studentId: number; gender: 'M' | 'F' }
  | { kind: 'decades'; studentId: number; g: GenderChoice }
  | { kind: 'decade'; studentId: number; g: GenderChoice; decade: number }
  | { kind: 'year'; studentId: number; g: GenderChoice; year: number }
  | {
      kind: 'month';
      studentId: number;
      g: GenderChoice;
      year: number;
      month: number;
    }
  | { kind: 'review'; studentId: number; g: GenderChoice; iso: string }
  | { kind: 'save'; studentId: number; g: GenderChoice; iso: string | null }
  | { kind: 'cancel'; studentId: number };

const two = (n: number) => String(n).padStart(2, '0');

export const profileCb = {
  start: (id: number) => `pf:s:${id}`,
  gender: (id: number, g: 'M' | 'F') => `pf:g:${id}:${g}`,
  decades: (id: number, g: GenderChoice) => `pf:dl:${id}:${g}`,
  decade: (id: number, g: GenderChoice, decade: number) =>
    `pf:dd:${id}:${g}:${decade}`,
  year: (id: number, g: GenderChoice, year: number) =>
    `pf:dy:${id}:${g}:${year}`,
  month: (id: number, g: GenderChoice, year: number, month: number) =>
    `pf:dm:${id}:${g}:${year}-${two(month)}`,
  review: (id: number, g: GenderChoice, iso: string) =>
    `pf:dc:${id}:${g}:${iso}`,
  save: (id: number, g: GenderChoice, iso: string | null) =>
    `pf:ds:${id}:${g}:${iso ?? '-'}`,
  cancel: (id: number) => `pf:x:${id}`,
};

/** Karta raqami Postgres int4 (Branch/Student.id) — undan kattasi tugma emas. */
const MAX_INT4 = 2147483647;

export function parseProfileCallback(data: string): ProfileAction | null {
  const action = parseRaw(data);
  return action && action.studentId <= MAX_INT4 ? action : null;
}

function parseRaw(data: string): ProfileAction | null {
  let m = /^pf:s:(\d{1,10})$/.exec(data);
  if (m) return { kind: 'start', studentId: Number(m[1]) };
  m = /^pf:g:(\d{1,10}):([MF])$/.exec(data);
  if (m) {
    return {
      kind: 'gender',
      studentId: Number(m[1]),
      gender: m[2] as 'M' | 'F',
    };
  }
  m = /^pf:x:(\d{1,10})$/.exec(data);
  if (m) return { kind: 'cancel', studentId: Number(m[1]) };
  m = /^pf:dl:(\d{1,10}):([MFN])$/.exec(data);
  if (m) {
    return {
      kind: 'decades',
      studentId: Number(m[1]),
      g: m[2] as GenderChoice,
    };
  }
  m = /^pf:dd:(\d{1,10}):([MFN]):(\d{4})$/.exec(data);
  if (m) {
    return {
      kind: 'decade',
      studentId: Number(m[1]),
      g: m[2] as GenderChoice,
      decade: Number(m[3]),
    };
  }
  m = /^pf:dy:(\d{1,10}):([MFN]):(\d{4})$/.exec(data);
  if (m) {
    return {
      kind: 'year',
      studentId: Number(m[1]),
      g: m[2] as GenderChoice,
      year: Number(m[3]),
    };
  }
  m = /^pf:dm:(\d{1,10}):([MFN]):(\d{4})-(\d{2})$/.exec(data);
  if (m) {
    return {
      kind: 'month',
      studentId: Number(m[1]),
      g: m[2] as GenderChoice,
      year: Number(m[3]),
      month: Number(m[4]),
    };
  }
  m = /^pf:dc:(\d{1,10}):([MFN]):(\d{4}-\d{2}-\d{2})$/.exec(data);
  if (m) {
    return {
      kind: 'review',
      studentId: Number(m[1]),
      g: m[2] as GenderChoice,
      iso: m[3],
    };
  }
  m = /^pf:ds:(\d{1,10}):([MFN]):(\d{4}-\d{2}-\d{2}|-)$/.exec(data);
  if (m) {
    return {
      kind: 'save',
      studentId: Number(m[1]),
      g: m[2] as GenderChoice,
      iso: m[3] === '-' ? null : m[3],
    };
  }
  return null;
}

/** Yagona tugma. `'preview'`: tugma 0-raqamli kartada ishlaydi, bazaga tegmaydi. */
export function buildRequestKeyboard(target: number | 'preview') {
  const id = target === 'preview' ? PREVIEW_STUDENT_ID : target;
  return Markup.inlineKeyboard([
    [Markup.button.callback("📝 Ma'lumotlarni kiritish", profileCb.start(id))],
  ]);
}
