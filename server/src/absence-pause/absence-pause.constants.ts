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

/** `12.09.2026` — Toshkent kalendar kuni, admin o'qiydigan ko'rinishda. */
function formatTashkentDate(d: Date): string {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const [year, month, day] = s.split('-');
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
