/**
 * «Darajani aniqlash» taklifi (ADR-0127): namuna yuborish va auditoriyani sanash.
 *
 *   railway run npx ts-node --transpile-only scripts/level-test-invite-sample.ts --count
 *   railway run npx ts-node --transpile-only scripts/level-test-invite-sample.ts --send=<chatId>
 *
 * `--count` faqat o'qiydi. `--send` BITTA chatga (odatda CEO'ning o'ziga) yuboradi
 * va `LevelTestInvite` ga yozmaydi. Hammaga yuborish — faqat cron (`LEVEL_TEST_INVITE=on`).
 */
import { Markup, Telegram } from 'telegraf';
import { loadInviteAudience } from '../src/telegram/level-test-invite/level-test-invite.audience';
import {
  LEVEL_TEST_INVITE_BUTTON,
  LEVEL_TEST_INVITE_TEXT,
} from '../src/telegram/level-test-invite/level-test-invite.text';
import { run } from './lib/check-cli';

run(async (prisma) => {
  const arg = process.argv.find((a) => a.startsWith('--send='));
  if (process.argv.includes('--count')) {
    const a = await loadInviteAudience(prisma);
    console.log(
      `Auditoriya: ${a.chats.length} chat (o'quvchi ${a.students}, boshqa ${a.others})`,
    );
    return;
  }
  if (!arg) {
    console.error('--count yoki --send=<chatId> kerak');
    process.exitCode = 1;
    return;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN yo‘q');
    process.exitCode = 1;
    return;
  }
  const chatId = arg.split('=')[1];
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(LEVEL_TEST_INVITE_BUTTON, 'menu_level')],
  ]);
  await new Telegram(token).sendMessage(chatId, LEVEL_TEST_INVITE_TEXT, {
    parse_mode: 'HTML',
    reply_markup: keyboard.reply_markup,
  });
  console.log(`Namuna ${chatId} ga yuborildi`);
});
