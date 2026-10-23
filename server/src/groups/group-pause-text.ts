import { formatUzPhone } from '../common/utils/phone.util';
import { escapeHtml } from '../telegram-groups/utils/format.util';

/**
 * The student's group-pause messages, approved by the CEO on 23.10.2026
 * (ADR-0119, §7) — do not reword; the spec pins every line. Telegram HTML:
 * names are escaped.
 */
const greeting = (firstName: string) =>
  firstName ? `Hurmatli ${escapeHtml(firstName)}!` : 'Assalomu alaykum!';

const WEEKDAYS = [
  'yakshanba',
  'dushanba',
  'seshanba',
  'chorshanba',
  'payshanba',
  'juma',
  'shanba',
];

/** «05.11» from 'YYYY-MM-DD'. */
export const ddmm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** «chorshanba» from 'YYYY-MM-DD'. */
export const weekdayName = (day: string) =>
  WEEKDAYS[new Date(`${day}T00:00:00.000Z`).getUTCDay()];

const phoneBlock = (phone: string | null) =>
  phone ? ['', `📞 Savollar bo'lsa: ${formatUzPhone(phone)}`] : [];

export function groupPausedText(p: {
  firstName: string;
  groupName: string;
  /** 'YYYY-MM-DD'; null while the restart day is not known. */
  resumeDay: string | null;
  phone: string | null;
}): string {
  return [
    "<b>⏸ Darslar vaqtincha to'xtatildi</b>",
    '',
    greeting(p.firstName),
    '',
    `<b>${escapeHtml(p.groupName)}</b> guruhi darslari vaqtincha to'xtatildi.`,
    p.resumeDay
      ? `Darslar <b>${ddmm(p.resumeDay)}</b> dan qayta boshlanadi.`
      : "Qayta boshlanish sanasi aniq bo'lishi bilan sizga xabar beramiz.",
    '',
    "To'xtagan kunlardagi darslar puli balansingizga qaytariladi.",
    ...phoneBlock(p.phone),
    '',
    'Rahmat!',
  ].join('\n');
}

export function groupResumeDayText(p: {
  firstName: string;
  groupName: string;
  resumeDay: string;
}): string {
  return [
    '<b>📅 Darslar boshlanish sanasi</b>',
    '',
    greeting(p.firstName),
    '',
    `<b>${escapeHtml(p.groupName)}</b> guruhi darslari <b>${ddmm(p.resumeDay)}</b> dan qayta boshlanadi.`,
    '',
    'Rahmat!',
  ].join('\n');
}

export function groupResumedText(p: {
  firstName: string;
  groupName: string;
  /** The first lesson after the restart: 'YYYY-MM-DD' and 'HH:mm'. */
  firstLessonDay: string;
  firstLessonTime: string | null;
}): string {
  const when = [
    ddmm(p.firstLessonDay),
    weekdayName(p.firstLessonDay),
    ...(p.firstLessonTime ? [p.firstLessonTime] : []),
  ].join(', ');
  return [
    '<b>▶️ Darslar qayta boshlanmoqda</b>',
    '',
    greeting(p.firstName),
    '',
    `<b>${escapeHtml(p.groupName)}</b> guruhi darslari qayta boshlanadi.`,
    `Birinchi dars: <b>${when}</b>.`,
    '',
    "Oylik to'lov shu kundan boshlab hisoblanadi.",
    '',
    "Darslarda ko'rishguncha. Rahmat!",
  ].join('\n');
}
