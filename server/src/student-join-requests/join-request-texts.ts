import { formatUzPhone } from '../common/utils/phone.util';
import { escapeHtml } from '../telegram-groups/utils/format.util';
import {
  daysMap,
  weekdayLabels,
} from '../telegram/scenes/student-registration-helpers';

/**
 * What the bot says about a join request (ADR-0080). The four messages are
 * the CEO-approved wording of spec 2026-10-10-guruhga-qoshilish-tasdigi §9 —
 * do not reword; the spec file pins every line. Telegram HTML: what the
 * person typed is escaped.
 */

/** Plain bot replies before a request exists. */
export const PHONE_TAKEN_REPLY =
  "Bu telefon raqam allaqachon tizimda ro'yxatdan o'tgan. Muammo bo'lsa administrator bilan bog'laning.";
export const CHAT_TAKEN_REPLY = "Siz allaqachon ro'yxatdan o'tgansiz!";
export const GROUP_CLOSED_REPLY =
  "Bu guruhga hozir yozilib bo'lmaydi. Administrator bilan bog'laning.";

export function pendingRequestNotice(groupName: string): string {
  return `Sizda ko'rib chiqilayotgan so'rov bor: ${groupName}. Yangisini yuborsangiz, avvalgisi bekor bo'ladi.`;
}

/** «Toq kunlar | 15:00 – 16:30», as the group link's card reads it; null when the group has neither. */
export function scheduleText(g: {
  days: string | null;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
}): string | null {
  const days = g.days
    ? (daysMap[g.days] ?? '')
    : g.exactDays.map((d) => weekdayLabels[d] ?? d).join(', ');
  const time =
    g.lessonStartTime && g.lessonEndTime
      ? `${g.lessonStartTime} – ${g.lessonEndTime}`
      : '';
  return [days, time].filter(Boolean).join(' | ') || null;
}

/** The login as the student types it: «90 123 45 67» for a 9-digit number. */
export function loginText(phone: string): string {
  return /^\d{9}$/.test(phone) ? formatUzPhone(phone).slice(5) : phone;
}

const greeting = (firstName: string) =>
  `Hurmatli <b>${escapeHtml(firstName)}</b>!`;

const groupLines = (p: {
  teacherName: string | null;
  schedule: string | null;
}): string[] => [
  ...(p.teacherName ? [`👨‍🏫 O'qituvchi: ${escapeHtml(p.teacherName)}`] : []),
  ...(p.schedule ? [`🕐 Dars vaqti: ${escapeHtml(p.schedule)}`] : []),
];

/** The ask-the-administrator line and the phone under it, or the line alone. */
const contactLines = (ask: string, phone: string | null): string[] =>
  phone ? [`${ask}:`, `📞 ${formatUzPhone(phone)}`] : [`${ask}.`];

export function joinRequestReceivedText(p: {
  firstName: string;
  groupName: string;
  teacherName: string | null;
  schedule: string | null;
}): string {
  const lines = groupLines(p);
  return [
    "✅ <b>So'rovingiz qabul qilindi</b>",
    '',
    greeting(p.firstName),
    `Siz <b>${escapeHtml(p.groupName)}</b> guruhiga yozilish uchun so'rov yubordingiz.`,
    '',
    ...(lines.length ? [...lines, ''] : []),
    "Administrator so'rovingizni ko'rib chiqib, shu yerga xabar beradi. Odatda bu bir ish kuni ichida bo'ladi.",
    'Rahmat!',
  ].join('\n');
}

export function joinRequestApprovedText(p: {
  firstName: string;
  groupName: string;
  teacherName: string | null;
  schedule: string | null;
  phone: string;
  password: string;
}): string {
  return [
    '🎉 <b>Siz guruhga qabul qilindingiz!</b>',
    '',
    greeting(p.firstName),
    "So'rovingiz tasdiqlandi.",
    '',
    `📚 Guruh: <b>${escapeHtml(p.groupName)}</b>`,
    ...groupLines(p),
    '',
    '🔐 <b>Shaxsiy kabinetingiz</b>',
    '🌐 student.dafzentrum.uz',
    `📱 Login: <b>${escapeHtml(loginText(p.phone))}</b>`,
    `🔑 Parol: <b>${escapeHtml(p.password)}</b>`,
    '',
    "Darslarda ko'rishguncha!",
  ].join('\n');
}

export function joinRequestRejectedText(p: {
  firstName: string;
  groupName: string;
  phone: string | null;
}): string {
  return [
    "ℹ️ <b>So'rovingiz tasdiqlanmadi</b>",
    '',
    greeting(p.firstName),
    `<b>${escapeHtml(p.groupName)}</b> guruhiga yozilish bo'yicha so'rovingiz tasdiqlanmadi.`,
    '',
    ...contactLines(
      "Savolingiz bo'lsa yoki bu xato deb o'ylasangiz, administrator bilan bog'laning",
      p.phone,
    ),
    '',
    'Rahmat!',
  ].join('\n');
}

export function joinRequestExpiredText(p: {
  firstName: string;
  groupName: string;
  phone: string | null;
}): string {
  return [
    "⏳ <b>So'rovingiz ko'rib chiqilmadi</b>",
    '',
    greeting(p.firstName),
    `<b>${escapeHtml(p.groupName)}</b> guruhiga yozilish bo'yicha so'rovingizni 7 kun ichida ko'rib chiqa olmadik. Uzr so'raymiz.`,
    '',
    ...contactLines(
      "Iltimos, administrator bilan bog'laning — birga hal qilamiz",
      p.phone,
    ),
    '',
    'Rahmat!',
  ].join('\n');
}
