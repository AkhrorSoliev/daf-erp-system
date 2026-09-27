import type { LoggerService } from '@nestjs/common';
import { Markup, type Telegram } from 'telegraf';
import type { BotContext } from '../types/context';

/**
 * Botning o'quvchi portali Mini App'iga eshiklari (ADR-0040).
 *
 * Manzil `TELEGRAM_MINI_APP_URL` dan keladi. U yo'q bo'lsa hammasi avvalgidek:
 * «🎓 Platformaga kirish» «tez kunda» deydi, menyu tugmasiga tegilmaydi.
 */

/** Bosh menyudagi o'quvchi portaliga kirish tugmasi. */
export const PLATFORM_BUTTON_TEXT = '🎓 Platformaga kirish';

/** Xabar maydoni yonidagi doimiy Mini App tugmasining yozuvi. */
export const MINI_APP_MENU_BUTTON_TEXT = 'Kabinet';

const COMING_SOON = 'Bu funksiya tez kunda ishga tushadi! ⏳';

/**
 * Platforma tugmasi: Mini App sozlangan va chat shaxsiy bo'lsa — Mini App'ning
 * o'zi, aks holda eski callback tugma.
 *
 * FAQAT SHAXSIY CHATDA: Telegram `web_app` inline tugmasini boshqa chatda
 * qabul qilmaydi (BUTTON_TYPE_INVALID) va u bilan birga BUTUN xabarni rad
 * etadi — guruhda bosh menyu tugma bilan emas, butunlay yo'qolardi.
 */
export function platformButton(
  miniAppUrl: string | undefined,
  chatType: string | undefined,
) {
  return miniAppUrl && chatType === 'private'
    ? Markup.button.webApp(PLATFORM_BUTTON_TEXT, miniAppUrl)
    : Markup.button.callback(PLATFORM_BUTTON_TEXT, 'menu_platform');
}

/**
 * Callback ko'rinishidagi «🎓 Platformaga kirish» bosilganda.
 *
 * Mini App sozlanguncha yuborilgan menyular chat tarixida qoladi va ularning
 * tugmasi callback. Endi uni bosgan odamga Mini App'ni ochadigan tugma
 * yuboriladi; Mini App sozlanmagan bo'lsa (yoki chat shaxsiy bo'lmasa) —
 * avvalgi «tez kunda».
 */
export async function answerPlatformMenu(
  ctx: BotContext,
  miniAppUrl: string | undefined,
): Promise<void> {
  if (!miniAppUrl || ctx.chat?.type !== 'private') {
    await ctx.answerCbQuery(COMING_SOON, { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();
  await ctx.reply(
    "O'quvchi kabinetini ochish uchun tugmani bosing:",
    Markup.inlineKeyboard([
      [Markup.button.webApp(PLATFORM_BUTTON_TEXT, miniAppUrl)],
    ]),
  );
}

/**
 * Xabar maydoni yonidagi doimiy «Kabinet» tugmasi — botning barcha shaxsiy
 * chatlari uchun standart menyu tugmasi (`chat_id`siz).
 *
 * Faqat manzil sozlanganda o'rnatiladi. Manzil olib tashlansa tugma O'ZI
 * QAYTMAYDI: prod tokeni bilan lokal ishga tushirilgan server ham shu yerdan
 * o'tadi va u prod botning menyusini tozalab yubormasligi kerak. Qaytarish —
 * BotFather'da (Bot Settings → Menu Button).
 *
 * Xato bo'lsa bot baribir ishga tushadi: menyu tugmasi — qulaylik, bot esa
 * ro'yxatdan o'tish va to'lovlar uchun kerak.
 */
export async function installMiniAppMenuButton(
  telegram: Pick<Telegram, 'setChatMenuButton'>,
  miniAppUrl: string | undefined,
  logger: Pick<LoggerService, 'log' | 'warn'>,
): Promise<void> {
  if (!miniAppUrl) return;
  try {
    await telegram.setChatMenuButton({
      menuButton: {
        type: 'web_app',
        text: MINI_APP_MENU_BUTTON_TEXT,
        web_app: { url: miniAppUrl },
      },
    });
    logger.log(`Mini App menyu tugmasi o'rnatildi: ${miniAppUrl}`);
  } catch (err) {
    logger.warn(
      `Mini App menyu tugmasini o'rnatib bo'lmadi: ${(err as Error).message}`,
    );
  }
}
