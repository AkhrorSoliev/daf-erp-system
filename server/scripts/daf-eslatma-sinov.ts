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
 * Before sending it prints the chat, the database and the bot (never the
 * token): this file loads `server/.env`, so outside `railway run` a local
 * token and a DEV database are picked up, and the printout is how you see it.
 * The button under each message is `dr:off:0`: the bot ties it to nobody.
 */
import { Telegram } from 'telegraf';
import { describeError } from '../src/telegram-digest/telegram-send';
import { dbEnvLabel, dbHost, makePrisma } from './lib/check-cli';
import { ceoWhere, runSinov } from './lib/daf-eslatma-sinov';

async function ceoChati(userId: number): Promise<string | null> {
  const prisma = makePrisma();
  try {
    const u = await prisma.user.findFirst({
      where: ceoWhere(userId),
      select: { telegramChatId: true },
    });
    return u?.telegramChatId ?? null;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runSinov(process.argv.slice(2), {
    token: process.env.TELEGRAM_BOT_TOKEN,
    log: (line) => console.log(line),
    chatOfCeo: ceoChati,
    dbInfo: () => `${dbHost()} [${dbEnvLabel()}]`,
    telegram: (token) => new Telegram(token),
    pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }).catch((err) => {
    console.error(describeError(err));
    process.exitCode = 1;
  });
}
