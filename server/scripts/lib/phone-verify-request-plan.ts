import { Markup } from 'telegraf';

/** So'rov xabarining o'zgarmas jumlasi: takror yuborishni to'xtatish kaliti (SmsMessage dedupe). */
export const PHONE_VERIFY_MARKER =
  'Raqamingizni tasdiqlash uchun pastdagi tugmani bosing';

export const PHONE_VERIFY_BUTTON = '📱 Raqamni tasdiqlash';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `firstName` null: bitta chatda bir nechta o'quvchi (ota-ona) — ismsiz salom. */
export function buildPhoneVerifyText(firstName: string | null): string {
  const hello = firstName
    ? `Assalomu alaykum, ${esc(firstName)}! 😊`
    : 'Assalomu alaykum! 😊';
  return (
    `${hello}\n\n` +
    'Mobil ilovamizda sizni yangi imkoniyatlar kutmoqda. Ulardan foydalanish uchun avval telefon raqamingizni tasdiqlang. Bu hisobingizni ham himoya qiladi.\n\n' +
    '<b>Ilovada hozir bor:</b>\n' +
    "• Reyting: markazdagi o'rningiz va boshqa o'quvchilarning profili\n\n" +
    "<b>Tez orada qo'shiladi:</b>\n" +
    "• O'quvchilar chati: guruhdoshlaringiz bilan ilova ichida suhbatlashing\n" +
    "• Musobaqalar: nemis tili bo'yicha bellashuvlar va sovrinlar\n" +
    "• Yangi o'quv bo'limlari: mashqlar va o'yinlar\n\n" +
    `${PHONE_VERIFY_MARKER}. Rahmat! 🙏`
  );
}

/** Tugma student Mini App'ni ochadi; telefon qadamini ilovaning o'zi so'raydi (ADR-0039). */
export function buildPhoneVerifyKeyboard(miniAppUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.webApp(PHONE_VERIFY_BUTTON, miniAppUrl)],
  ]);
}

export interface AudienceStudent {
  id: number;
  firstName: string;
  companyId: number;
  telegramChatId: string;
  phone: string | null;
  verifiedPhone: string | null;
}

/** Raqami 9 xonali va kartadagi raqam hali SMS bilan tasdiqlanmagan (xorijiy raqam so'ralmaydi). */
export const needsVerification = (s: AudienceStudent): boolean =>
  /^\d{9}$/.test(s.phone ?? '') && s.verifiedPhone !== s.phone;

export interface ChatTarget {
  chatId: string;
  students: AudienceStudent[];
}

/** Bitta chatga bitta xabar: bir nechta kartasi bor chat (ota-ona) ikki marta olmaydi. */
export function groupByChat(
  students: AudienceStudent[],
  done: ReadonlySet<number>,
): ChatTarget[] {
  const byChat = new Map<string, AudienceStudent[]>();
  for (const s of students) {
    if (done.has(s.id) || !needsVerification(s)) continue;
    byChat.set(s.telegramChatId, [...(byChat.get(s.telegramChatId) ?? []), s]);
  }
  return [...byChat].map(([chatId, list]) => ({ chatId, students: list }));
}

export const greetingName = (t: ChatTarget): string | null =>
  t.students.length === 1 ? t.students[0].firstName : null;
