import { tashkentDateStr } from '../common/date/tashkent';

/**
 * Avtomatik pauza sababining boshlanishi.
 *
 * `/outreach` ning «Pauzadagilar» tabi muzlatilgan o'quvchilar ichidan
 * avtomatiklarini aynan shu prefiks bo'yicha ajratadi — prodda 209 ta
 * qo'lda muzlatilgan o'quvchi bor va ular aralashib ketmasligi kerak.
 * Cron ham, o'qish ham shu bitta konstantadan foydalanadi: matnni bir
 * joyda o'zgartirsang, ro'yxat jimgina bo'shab qolardi.
 */
export const AUTO_PAUSE_REASON_PREFIX = 'Avtomatik pauza:';

/**
 * `12.09.2026` — the Tashkent calendar day, in the one format this feature
 * prints: the pause reason admins read and the stage-1 message students
 * read. The day itself comes from `common/date/tashkent`, the single source
 * for which Tashkent day an instant falls on.
 */
export function formatTashkentDate(d: Date): string {
  const [year, month, day] = tashkentDateStr(d).split('-');
  return `${day}.${month}.${year}`;
}

/**
 * Sabab matni o'z-o'zini tushuntirsin: necha dars va qachongacha. Bu matn
 * o'quvchi profilida, guruh tarixida va filial Telegram guruhida
 * ko'rinadi, ya'ni uni o'qigan odamda «nega?» degan savol qolmasligi
 * kerak.
 */
export function buildAutoPauseReason(
  streak: number,
  lastAbsence: Date,
): string {
  return `${AUTO_PAUSE_REASON_PREFIX} ${streak} ta ketma-ket dars qoldirildi (oxirgisi ${formatTashkentDate(lastAbsence)})`;
}
