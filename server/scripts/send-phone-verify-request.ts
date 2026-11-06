/**
 * Telegramga bog'langan faol o'quvchilarga «telefon raqamingizni tasdiqlang»
 * xabarini yuboradi. Tugma student Mini App'ni ochadi; SMS kodini ilovadagi
 * ADR-0039 qadami o'zi yuboradi — bu skript hech qanday SMS yubormaydi.
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/send-phone-verify-request.ts [rejim]
 *
 * Rejimlar (tartib bilan): (bo'sh) sinov · --preview=<chatId> · --apply --expect=N
 * Bir marta: SmsMessage'da shu matnli SENT yozuvi bor o'quvchi o'tkazib yuboriladi.
 */
import { Telegram } from 'telegraf';
import { sendTelegramText } from '../src/telegram-digest/telegram-send';
import type { Prisma } from '@prisma/client';
import { makePrisma, printHeader, run } from './lib/check-cli';
import { UsageError } from './lib/apply-expect-args';
import { parseProfileRequestArgs } from './lib/profile-request-plan';
import {
  PHONE_VERIFY_MARKER,
  buildPhoneVerifyKeyboard,
  buildPhoneVerifyText,
  greetingName,
  groupByChat,
} from './lib/phone-verify-request-plan';

/** Telegram umumiy ~30 xabar/s; 20/s xavfsiz. */
const GAP_MS = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Har yozuv o'z ulanishida: uzun tsiklda bitta ulanish uzilsa (29.10: 603 chatdan
 * 6 tasidan keyin) qolganlar yuborilmay qolardi. 3 urinish, so'ng false.
 */
async function record(
  data: Prisma.SmsMessageCreateManyInput[],
): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const db = makePrisma();
    try {
      await db.smsMessage.createMany({ data });
      return true;
    } catch (e) {
      console.warn(`yozuv urinishi ${attempt}: ${(e as Error).message}`);
    } finally {
      await db.$disconnect().catch(() => undefined);
    }
    await sleep(500 * attempt);
  }
  return false;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} yo‘q`);
  return v;
}

void run(async (prisma) => {
  let mode;
  try {
    mode = parseProfileRequestArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(e.message);
      process.exitCode = 2;
      return;
    }
    throw e;
  }

  printHeader(
    mode.mode === 'apply'
      ? 'Telefon tasdiqlash so‘rovi — YUBORISH'
      : mode.mode === 'preview'
        ? 'Telefon tasdiqlash so‘rovi — KO‘RINISH (faqat sizga)'
        : 'Telefon tasdiqlash so‘rovi — sinov',
  );

  const miniAppUrl = env('TELEGRAM_MINI_APP_URL');
  const bot = { telegram: new Telegram(env('TELEGRAM_BOT_TOKEN')) };
  const keyboard = buildPhoneVerifyKeyboard(miniAppUrl).reply_markup;

  if (mode.mode === 'preview') {
    const out = await sendTelegramText(
      bot,
      mode.chatId,
      buildPhoneVerifyText('Aziz'),
      { parse_mode: 'HTML', reply_markup: keyboard },
    );
    console.log(out.ok ? 'yuborildi' : `xato: ${out.kind} ${out.description}`);
    return;
  }

  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      telegramChatId: { not: null },
      telegramDisconnectedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      companyId: true,
      telegramChatId: true,
      phone: true,
      verifiedPhone: true,
    },
    orderBy: { id: 'asc' },
  });
  const done = new Set(
    (
      await prisma.smsMessage.findMany({
        where: { status: 'SENT', content: { contains: PHONE_VERIFY_MARKER } },
        select: { studentId: true },
      })
    ).map((s) => s.studentId),
  );

  const targets = groupByChat(
    students.map((s) => ({ ...s, telegramChatId: s.telegramChatId as string })),
    done,
  );
  console.log(`Faol, Telegramga bog'langan o'quvchilar: ${students.length}`);
  console.log(`Yuboriladigan chatlar: ${targets.length}`);
  console.log(`Oldin yuborilgani (o'tkazib yuboriladi): ${done.size}`);
  if (targets[0]) {
    console.log(
      `\n── Namuna ──\n${buildPhoneVerifyText(greetingName(targets[0]))}\n`,
    );
  }

  if (mode.mode === 'dry') {
    console.log(
      `Sinov. Ko'rinish: --preview=<chatId>. Yuborish: --apply --expect=${targets.length}`,
    );
    return;
  }
  if (targets.length !== mode.expect) {
    throw new Error(
      `Chatlar soni ${targets.length}, kutilgan ${mode.expect} — to'xtadi`,
    );
  }

  let sent = 0;
  let failed = 0;
  const unrecorded: string[] = [];
  for (const t of targets) {
    const text = buildPhoneVerifyText(greetingName(t));
    const out = await sendTelegramText(bot, t.chatId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    // Yuborilgan xabar qaytmaydi: yozuv yiqilsa tsikl to'xtamaydi, chat ro'yxatga olinadi.
    const recorded = await record(
      t.students.map((s) => ({
        studentId: s.id,
        content: text,
        type: 'AUTO' as const,
        status: out.ok ? ('SENT' as const) : ('FAILED' as const),
        telegramMessageId: out.ok ? out.messageId : null,
        errorMessage: out.ok ? null : out.description,
        companyId: s.companyId,
      })),
    );
    if (!recorded) unrecorded.push(`${t.chatId}${out.ok ? '' : ' (xato)'}`);
    if (out.ok) sent += 1;
    else {
      failed += 1;
      console.warn(`chat ${t.chatId}: ${out.kind} ${out.description}`);
    }
    await sleep(GAP_MS);
  }
  console.log(`Tayyor: yuborildi ${sent}, xato ${failed}`);
  if (unrecorded.length) {
    console.warn(
      `Bazaga yozilmadi (qayta yuborilsa takror boradi): ${unrecorded.join(', ')}`,
    );
  }
  if (failed || unrecorded.length) process.exitCode = 1;
});
