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

/** Shown in place of a registration link or QR for a branch the bot refuses. */
export const BRANCH_CLOSED_TO_REGISTRATION =
  "Filial faol emas — bu filialga Telegram orqali ro'yxatdan o'tib bo'lmaydi.";

/**
 * Whether the bot refuses student registration for a branch with this status.
 *
 * `/start` accepts a `student_<branch>` or `student_<branch>_group_<group>`
 * link only for an ACTIVE branch (server/CLAUDE.md, "Registration deep
 * links"). Pass the status from `useBranchStatus`, never from
 * `selectedBranch`, which can be an older copy.
 *
 * An unknown status is not a refusal: the branch list may not have loaded
 * yet, or the sign-in cookie predates the payload carrying it. Treating that
 * as closed would take every link away until the next token refresh, and the
 * bot still decides.
 */
export function branchClosedToRegistration(status: string | undefined): boolean {
  return status !== undefined && status !== "ACTIVE";
}

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
