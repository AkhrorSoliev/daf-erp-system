/**
 * «Darajani aniqlash» taklifi (ADR-0127). Matn CEO tasdiqlagan, so'zma-so'z:
 * o'zgartirishdan oldin ADR va CEO bilan kelishing. HTML (`parse_mode: 'HTML'`).
 */
export const LEVEL_TEST_INVITE_TEXT = [
  '<b>🇩🇪 Nemis tilida qaysi darajadasiz?</b>',
  'Sizga <b>20 ta savol</b> beramiz va oxirida taxminiy darajangizni aytamiz 🎯',
  '',
  '📈 Savollar <b>A1 dan B2 gacha</b>, asta-sekin qiyinlashib boradi.',
  "Qiyin bo'lib qolsa, to'xtang 🙌 «🏁 Natijani bilish» tugmasini bosing, shu paytgacha yetgan darajangizni aytamiz. Hammasiga javob berishingiz shart emas.",
  '',
  '⏱ Taxminan 10 daqiqa ketadi.',
  '👇 Boshlash uchun pastdagi tugmani bosing.',
].join('\n');

/** /start menyusidagi tugma bilan bir xil yozuv. */
export const LEVEL_TEST_INVITE_BUTTON = '📊 Darajani aniqlash';
