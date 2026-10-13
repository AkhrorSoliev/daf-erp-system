import { toMinutes } from '../attendance/shared/attendance-window';
import { escapeHtml } from '../telegram-groups/utils/format.util';

/** Dars tugaganidan keyin so'rash oynasi, daqiqalarda (spec §3.2). */
export const ASK_AFTER_MIN = 10;
export const ASK_UNTIL_MIN = 180;
/** Tugma va izoh shu muddat ichida qabul qilinadi. */
export const RATING_WINDOW_MS = 48 * 60 * 60 * 1000;
export const COMMENT_MAX = 500;
/** Shu va undan past baho — «past baho»: izoh so'raladi, ro'yxatga tushadi. */
export const LOW_SCORE_MAX = 3;

export const ASK_COMMENT =
  'Nima yoqmadi? Shu xabarga javob qilib yozing (ixtiyoriy).';
export const COMMENT_SAVED = 'Rahmat, fikringiz yetkazildi.';
export const COMMENT_ALREADY = 'Fikringiz allaqachon yozilgan.';
export const NOT_YOURS = "Bu so'rov sizga emas";
export const EXPIRED = "Baho berish muddati o'tgan";
export const ALREADY_RATED = 'Siz allaqachon baho bergansiz';
export const TRY_LATER = "Keyinroq urinib ko'ring";

const CALLBACK =
  /^lr:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([1-5])$/;

export function shouldAskNow(endTime: string, nowMinutes: number): boolean {
  const since = nowMinutes - toMinutes(endTime);
  return since >= ASK_AFTER_MIN && since <= ASK_UNTIL_MIN;
}

export function ratingQuestion(a: {
  studentFirstName: string;
  groupName: string;
  teacherNames: string[];
}): string {
  const lines = [
    `📚 <b>${escapeHtml(a.studentFirstName)}</b>, bugungi «${escapeHtml(a.groupName)}» darsi qanday o'tdi?`,
  ];
  if (a.teacherNames.length > 0) {
    lines.push(`Ustoz: ${a.teacherNames.map(escapeHtml).join(', ')}`);
  }
  return `${lines.join('\n')}\n\nBaho bering:`;
}

export function ratingKeyboard(ratingId: string) {
  return {
    inline_keyboard: [
      [1, 2, 3, 4, 5].map((n) => ({
        text: `${n} ⭐`,
        callback_data: `lr:${ratingId}:${n}`,
      })),
    ],
  };
}

export function parseRatingCallback(
  data: string,
): { ratingId: string; score: number } | null {
  const m = CALLBACK.exec(data);
  return m ? { ratingId: m[1], score: Number(m[2]) } : null;
}

/**
 * Telegram «konfetti» xabar effekti (🎉, Bot API 7.4+). Faqat YANGI xabar bilan
 * va faqat private chatda ishlaydi — mavjud xabarni tahrirlashda qo'shib bo'lmaydi.
 */
export const CONFETTI_EFFECT_ID = '5046509860389126442';

export function thanksText(score: number): string {
  return `Rahmat! Siz ${score} ⭐ qo'ydingiz.`;
}

export function isWithinWindow(sentAt: Date, now: Date): boolean {
  return now.getTime() - sentAt.getTime() <= RATING_WINDOW_MS;
}

export function cleanComment(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, COMMENT_MAX) : null;
}
