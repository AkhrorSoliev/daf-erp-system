import { Logger } from '@nestjs/common';
import { BotContext } from '../types/context';
import { describeError } from '../../telegram-digest/telegram-send';

/**
 * Closes a bot registration whose account now exists, then tells the person:
 * marks the preview confirmed and sends the login and password on their photo.
 *
 * The session forgets the registration before anything is sent. The photo
 * belongs to the new record now, and `/start`, `/cancel` and «Qayta kiritish»
 * delete the photo of a registration still held in the session.
 *
 * No Telegram failure is thrown from here: the account exists, and a throw
 * would read as if it did not. A failed caption edit costs the person nothing.
 * A photo Telegram cannot send (it cannot fetch the file from storage, the
 * network drops) goes again as a text message with the same `text` and
 * `extra`, because a password that never arrived leaves an account nobody can
 * use. If that fails too, the log says the account exists but its login and
 * password were not delivered.
 *
 * Log lines carry `describeError` only: `text` holds the password, and a
 * Telegraf error carries the request that failed, caption included.
 */
export async function finishRegistration(
  ctx: BotContext,
  logger: Logger,
  photo: string,
  text: string,
  extra: { parse_mode?: 'Markdown' } = {},
): Promise<void> {
  ctx.session.data = {};
  await ctx.scene.leave();

  try {
    await ctx.editMessageCaption('✅ Tasdiqlandi!');
  } catch {
    // Only the preview's label; the message below is what the person needs.
  }

  try {
    await ctx.replyWithPhoto(photo, { caption: text, ...extra });
    return;
  } catch (err) {
    logger.warn(
      `Login va parol rasm bilan yuborilmadi, matn bilan yuboriladi (chat ${ctx.chat?.id}): ${describeError(err)}`,
    );
  }

  try {
    await ctx.reply(text, extra);
  } catch (err) {
    logger.error(
      `Hisob ochildi, lekin login va parol yetkazilmadi (chat ${ctx.chat?.id}): ${describeError(err)}`,
    );
  }
}
