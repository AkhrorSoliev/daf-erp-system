/**
 * Ism / familiya so'rovlarining YAGONA manbai — o'quvchi, ustoz va xodim
 * ro'yxatdan o'tish sahnalari shu yerdan foydalanadi, shunda matn hamma joyda
 * bir xil bo'ladi.
 *
 * MUAMMO: foydalanuvchilarning ko'pchiligi "Ismingizni kiriting:" so'roviga
 * ism va familiyani BIRDANIGA yozib yuborardi ("Ali Valiyev"). Natijada
 * `firstName` ga to'liq ism tushib, keyingi qadamda familiya yana so'ralar va
 * bazada "Ali Valiyev Valiyev" kabi buzuq yozuv paydo bo'lardi.
 *
 * YECHIM ikki qatlamli:
 *   1. So'rovning o'zi familiya KEYIN so'ralishini ochiq aytadi.
 *   2. Baribir ikki so'z kiritilsa, `MULTI_WORD_NAME_HINT` bilan bir marta
 *      xushmuomala qaytarib so'raladi — bu taxmin qilishdan (masalan
 *      "Abdulla Abdurahmon o'g'li" ni qayerdan bo'lish kerak?) ko'ra xavfsiz.
 */

/**
 * Ism so'rovi — familiya keyin so'ralishi aniq aytilgan.
 *
 * Ataylab ODDIY MATN (HTML/Markdown emas): bu sahnalar asosan `parse_mode`siz
 * javob beradi, formatlash qo'shilsa ismlardagi maxsus belgilar (`_`, `*`)
 * xabarni buzishi mumkin edi.
 */
export const ASK_FIRST_NAME =
  "👤 Ismingizni kiriting:\n\nℹ️ Faqat ismingizni yozing — familiyangizni keyingi qadamda alohida so'raymiz.";

/** Familiya so'rovi. */
export const ASK_LAST_NAME = '👤 Endi familiyangizni kiriting:';

/** Juda qisqa ism. */
export const FIRST_NAME_TOO_SHORT =
  "Ism kamida 2 belgidan iborat bo'lishi kerak. Qayta kiriting:";

/** Juda qisqa familiya. */
export const LAST_NAME_TOO_SHORT =
  "Familiya kamida 2 belgidan iborat bo'lishi kerak. Qayta kiriting:";

/** Ism o'rniga to'liq ism-familiya yozilganda. */
export const MULTI_WORD_NAME_HINT =
  "Iltimos, hozir faqat ISMINGIZNI yozing — familiyangizni keyingi qadamda so'raymiz.\n\nMasalan: Ali";

/**
 * Foydalanuvchi ism o'rniga to'liq ism-familiya yozdimi?
 *
 * Bo'sh joy bo'yicha bo'lib, bo'sh bo'laklarni tashlaymiz — shunda ikki marta
 * probel yoki oxiridagi probel yolg'on ishora bermaydi.
 */
export function looksLikeFullName(text: string): boolean {
  return text.trim().split(/\s+/).filter(Boolean).length > 1;
}
