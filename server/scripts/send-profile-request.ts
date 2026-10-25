/**
 * Jinsi yoki tug'ilgan sanasi kartada yo'q faol o'quvchilarga Telegram'da so'rov
 * yuboradi (bitta xabar, bitta tugma, so'ng tugmali savol-javob: server/src/telegram/profile-request).
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/send-profile-request.ts [rejim]
 *
 * Rejimlar (tartib bilan):
 *   (bo'sh)             sinov: hech narsa yuborilmaydi, son va namuna chiqadi
 *   --preview=<chatId>  so'rov xabari FAQAT shu chatga; tugmalar hech
 *                       narsa yozmaydi, bazaga tegilmaydi
 *   --apply --expect=N  haqiqiy yuborish; son farq qilsa yozishdan oldin to'xtaydi
 *
 * Preview tugmalari ishlashi uchun bot kodi (pf: handlerlari) deploy qilingan
 * bo'lishi kerak. Bir marta: SmsMessage'da shu matnli SENT yozuvi bor o'quvchi
 * o'tkazib yuboriladi, shuning uchun skriptni qayta ishga tushirish xavfsiz.
 */
import { Telegram } from 'telegraf';
import { sendTelegramText } from '../src/telegram-digest/telegram-send';
import {
  PROFILE_REQUEST_MARKER,
  buildRequestKeyboard,
  buildRequestText,
} from '../src/telegram/profile-request/profile-request-text';
import { printHeader, run } from './lib/check-cli';
import { UsageError } from './lib/apply-expect-args';
import {
  buildPreviewMessages,
  parseProfileRequestArgs,
} from './lib/profile-request-plan';

/** Telegram: bir chatga sekundiga 1, umumiy ~30; 20/s xavfsiz. */
const GAP_MS = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function botTelegram(): Telegram {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN yo‘q');
  return new Telegram(token);
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
      ? "Jins/sana so'rovi — YUBORISH"
      : mode.mode === 'preview'
        ? "Jins/sana so'rovi — KO'RINISH (faqat sizga)"
        : "Jins/sana so'rovi — sinov",
  );

  if (mode.mode === 'preview') {
    const bot = { telegram: botTelegram() };
    for (const m of buildPreviewMessages()) {
      const out = await sendTelegramText(bot, mode.chatId, m.text, {
        parse_mode: 'HTML',
        ...(m.keyboard && { reply_markup: m.keyboard.reply_markup }),
      });
      console.log(
        out.ok ? 'yuborildi' : `xato: ${out.kind} ${out.description}`,
      );
      await sleep(GAP_MS);
    }
    return;
  }

  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      enrollments: {
        some: {
          deletedAt: null,
          status: 'ACTIVE',
          group: { deletedAt: null, statusEnum: { in: ['ACTIVE', 'PAUSED'] } },
        },
      },
      telegramChatId: { not: null },
      telegramDisconnectedAt: null,
      OR: [{ gender: null }, { dateOfBirth: null }],
    },
    select: {
      id: true,
      firstName: true,
      companyId: true,
      telegramChatId: true,
      gender: true,
      dateOfBirth: true,
    },
    orderBy: { id: 'asc' },
  });
  const done = new Set(
    (
      await prisma.smsMessage.findMany({
        where: {
          status: 'SENT',
          content: { contains: PROFILE_REQUEST_MARKER },
        },
        select: { studentId: true },
      })
    ).map((s) => s.studentId),
  );

  const todo = students.filter((s) => !done.has(s.id));
  const both = todo.filter((s) => !s.gender && !s.dateOfBirth).length;
  console.log(`Yuboriladigan o'quvchilar: ${todo.length}`);
  console.log(
    `  ikkalasi yo'q: ${both}, faqat jins: ${todo.filter((s) => !s.gender && s.dateOfBirth).length}, faqat sana: ${todo.filter((s) => s.gender && !s.dateOfBirth).length}`,
  );
  console.log(`Oldin yuborilgani (o'tkazib yuboriladi): ${done.size}`);
  if (todo[0]) {
    console.log(`\n── Namuna ──\n${buildRequestText(todo[0].firstName)}\n`);
  }

  if (mode.mode === 'dry') {
    console.log(
      `Sinov. Ko'rinish: --preview=<chatId>. Yuborish: --apply --expect=${todo.length}`,
    );
    return;
  }
  if (todo.length !== mode.expect) {
    throw new Error(
      `O'quvchilar soni ${todo.length}, kutilgan ${mode.expect} — to'xtadi`,
    );
  }

  const bot = { telegram: botTelegram() };
  let sent = 0;
  let failed = 0;
  for (const s of todo) {
    const text = buildRequestText(s.firstName);
    const out = await sendTelegramText(bot, s.telegramChatId as string, text, {
      parse_mode: 'HTML',
      reply_markup: buildRequestKeyboard(s.id).reply_markup,
    });
    await prisma.smsMessage.create({
      data: {
        studentId: s.id,
        content: text,
        type: 'AUTO',
        status: out.ok ? 'SENT' : 'FAILED',
        telegramMessageId: out.ok ? out.messageId : null,
        errorMessage: out.ok ? null : out.description,
        companyId: s.companyId,
      },
    });
    if (out.ok) sent += 1;
    else {
      failed += 1;
      console.warn(`student ${s.id}: ${out.kind} ${out.description}`);
    }
    await sleep(GAP_MS);
  }
  console.log(`Tayyor: yuborildi ${sent}, xato ${failed}`);
  if (failed) process.exitCode = 1;
});
