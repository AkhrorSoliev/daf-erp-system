/**
 * Manual CEO preview (NOT the bot's production send path, so it is outside
 * the ADR-0025 sendMessage guard, which scans `src/` only): sends the three
 * S4 texts (evening with a streak, evening without, Monday summary) with
 * FAKE sample data, each prefixed `[SINOV]`, to ONE staff chat, so the CEO can
 * read them before `DAF_ESLATMALAR=on` (spec S4 §5, ADR-0117). It never reads
 * a student and never writes the database (no DafReminderLog, no SmsMessage).
 * Without `--send` it only prints the texts.
 *
 *   npx ts-node --transpile-only scripts/daf-eslatma-sinov.ts --chat=<id>
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/daf-eslatma-sinov.ts --user=<CEO user id> --send
 *
 * Sending needs a target AND `--send` AND TELEGRAM_BOT_TOKEN. `--user` reads
 * one row (a live ACTIVE CEO's telegramChatId); `--chat` touches no database.
 * The button under each message is `dr:off:0`: the bot ties it to nobody.
 */
import { Telegram } from 'telegraf';
import { describeError } from '../src/telegram-digest/telegram-send';
import { makePrisma } from './lib/check-cli';
import {
  ceoWhere,
  parseSinovArgs,
  sinovXabarlari,
  yuborishTokeni,
} from './lib/daf-eslatma-sinov';
import { toxtatishTugmasi } from '../src/daf/eslatma/eslatma-matn';

async function ceoChati(userId: number): Promise<string> {
  const prisma = makePrisma();
  try {
    const u = await prisma.user.findFirst({
      where: ceoWhere(userId),
      select: { telegramChatId: true },
    });
    if (!u?.telegramChatId) {
      throw new Error(
        `Faol CEO ${userId} topilmadi yoki uning Telegram'i ulanmagan`,
      );
    }
    return u.telegramChatId;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = parseSinovArgs(process.argv.slice(2));
  const token = yuborishTokeni(args, process.env.TELEGRAM_BOT_TOKEN);
  const xabarlar = sinovXabarlari();
  for (const x of xabarlar) {
    console.log(`── ${x.nomi} (${x.matn.length} belgi)\n${x.matn}\n`);
  }
  if (!token) {
    console.log('Quruq yurish: hech narsa yuborilmadi. Yuborish uchun --send.');
    return;
  }
  const chatId = args.chat ?? (await ceoChati(args.user!));
  const telegram = new Telegram(token);
  for (const x of xabarlar) {
    await telegram.sendMessage(chatId, x.matn, {
      parse_mode: 'HTML',
      reply_markup: toxtatishTugmasi(0),
    });
  }
  console.log(`${xabarlar.length} ta xabar yuborildi.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(describeError(err));
    process.exitCode = 1;
  });
}
