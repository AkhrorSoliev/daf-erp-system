/**
 * Telegram bot deep-link qurish uchun yagona joy.
 *
 * NIMA UCHUN KERAK: bot username `NEXT_PUBLIC_TELEGRAM_BOT` env o'zgaruvchisidan
 * keladi va u build vaqtida kodga yoziladi. Agar o'zgaruvchi qo'yilmagan bo'lsa,
 * JS uni "undefined" degan MATNGA aylantiradi va natijada
 * `https://t.me/undefined?start=...` kabi tashqi ko'rinishi to'g'ri, lekin
 * ishlamaydigan havola hosil bo'ladi. Bunday havola nusxalanadi, QR kodi ham
 * chiroyli chiqadi — nosozlik faqat oxirgi foydalanuvchi bosganda ma'lum bo'ladi.
 *
 * Shuning uchun bu yerda `null` qaytariladi: chaqiruvchi UI havola yasash
 * o'rniga tushunarli xabar ko'rsatishi va nusxalash/QR tugmalarini o'chirishi kerak.
 */

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT;

/** Bot sozlanganmi (env o'zgaruvchisi mavjudmi). */
export const isTelegramBotConfigured = Boolean(BOT_USERNAME);

/**
 * Xodimga ko'rsatiladigan xabar. Ataylab texnik atamasiz — env o'zgaruvchisi
 * nomi foydalanuvchiga hech narsa anglatmaydi, u faqat konsolga yoziladi.
 */
export const TELEGRAM_BOT_NOT_CONFIGURED =
  "Telegram bot hozircha sozlanmagan — havola yaratib bo'lmaydi. Iltimos, administratorga murojaat qiling.";

let warned = false;

/**
 * `https://t.me/<bot>?start=<payload>` havolasini qaytaradi.
 * Bot sozlanmagan bo'lsa `null` — buzuq havola HECH QACHON qaytarilmaydi.
 */
export function buildBotLink(payload: string): string | null {
  if (!BOT_USERNAME) {
    if (!warned && typeof window !== "undefined") {
      warned = true;
      console.error(
        "[telegram] NEXT_PUBLIC_TELEGRAM_BOT o'rnatilmagan — Telegram havolalari yaratilmaydi. " +
          "Vercel loyiha sozlamalarida (Environment Variables) qo'shing va qayta deploy qiling.",
      );
    }
    return null;
  }
  return `https://t.me/${BOT_USERNAME}?start=${payload}`;
}
