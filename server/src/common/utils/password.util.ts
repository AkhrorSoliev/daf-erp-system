import { randomInt } from 'crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const ALL = UPPER + LOWER + DIGITS;
const LENGTH = 8;

/** One uniformly random character. */
function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

/**
 * 8 belgili random parol. Kamida 1 katta harf, 1 kichik harf, 1 raqam.
 *
 * Alifboda `I/l/1` va `O/0` yo'q — bu parol telefonda aytiladi yoki Telegram
 * xabaridan ko'chiriladi, shuning uchun o'xshash belgilar chiqarib tashlangan.
 *
 * **`crypto.randomInt`, `Math.random` EMAS.** Bu funksiya qaytargan qiymat —
 * haqiqiy hisob paroli: har bir o'qituvchi, xodim va o'quvchi uchun, hamda
 * Telegram bot orqali qilinadigan har bir parol TIKLASH uchun. Birinchi
 * kirishda majburiy o'zgartirish yo'q, ya'ni bu parol egasi almashtirmaguncha
 * amal qiladi. `Math.random` V8'da xorshift128+ — bir necha chiqishni ko'rgan
 * tomon ichki holatni tiklab, keyingilarini bashorat qila oladi; bot orqali
 * o'z parolini bir necha marta tiklagan insayder uchun bu real yo'l edi.
 *
 * Aralashtirish ham Fisher–Yates: eski `sort(() => Math.random() - 0.5)`
 * to'g'ri tartiblovchi emas (tranzitiv emas), shuning uchun natija bir tekis
 * emas, egri chiqadi — kafolatlangan belgilar ma'lum pozitsiyalarga moyil
 * bo'lib qoladi.
 */
export function generatePassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  for (let i = chars.length; i < LENGTH; i++) {
    chars.push(pick(ALL));
  }

  // Fisher–Yates: har bir joylashuv bir xil ehtimollik bilan chiqadi.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
