/**
 * Admin bot oxirgi yuborgan xabarni o'chirish (masalan, xato ketgan 21:00 kunlik
 * hisobot). Telegram Bot API bot uchun chat tarixini o'qishga ruxsat bermaydi,
 * shuning uchun oxirgi message_id shunday topiladi:
 *
 *   1. Chatga vaqtinchalik "probe" xabar yuboriladi → uning id'si = M.
 *   2. Probe darhol o'chiriladi.
 *   3. M-1, M-2 ... bo'ylab pastga qarab har bir id uchun `editMessageReplyMarkup`
 *      chaqiriladi. Bot FAQAT o'zining xabarini tahrirlashi mumkin:
 *        - muvaffaqiyat yoki "message is not modified" → xabar BIZNIKI
 *        - "message can't be edited" / author required → boshqa odamning xabari
 *      Shu tarzda begona (odam yozgan) xabarni o'chirib yuborish xavfi yo'q.
 *   4. Topilgan birinchi "bizniki" xabar o'chiriladi.
 *
 * Telegram 48 soatdan oldingi xabarlarni o'chirishga ruxsat bermaydi.
 *
 * Usage:
 *   Guruhlar ro'yxati (READ-ONLY):
 *     railway run npx ts-node --transpile-only scripts/delete-last-bot-message.ts
 *
 *   O'chirish:
 *     railway run npx ts-node --transpile-only scripts/delete-last-bot-message.ts \
 *       --chat <chatId> --apply [--count 1] [--scan 25]
 */
import { PrismaClient, TelegramGroupStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

type TgResult<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

const TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN;

async function tg<T>(method: string, body: unknown): Promise<TgResult<T>> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as TgResult<T>;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  if (!TOKEN) {
    console.error('❌ TELEGRAM_ADMIN_BOT_TOKEN topilmadi (env).');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  const chatArg = arg('chat');
  const howMany = Number(arg('count') ?? '1');
  const scanDepth = Number(arg('scan') ?? '25');

  const me = await tg<{ id: number; username: string }>('getMe', {});
  if (!me.ok || !me.result) {
    console.error('❌ getMe muvaffaqiyatsiz:', me.description);
    process.exit(1);
  }
  console.log(`🤖 Bot: @${me.result.username} (id ${me.result.id})`);

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  try {
    const groups = await prisma.telegramGroup.findMany({
      where: {
        status: TelegramGroupStatus.APPROVED,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { lastDailyReportAt: 'desc' },
      select: {
        chatId: true,
        title: true,
        lastDailyReportAt: true,
        branchId: true,
      },
    });

    console.log(`\n📋 Tasdiqlangan guruhlar: ${groups.length}`);
    for (const g of groups) {
      console.log(
        `   chatId=${g.chatId}  «${g.title}»  branchId=${g.branchId ?? '—'}  ` +
          `oxirgi hisobot=${g.lastDailyReportAt?.toISOString() ?? '—'}`,
      );
    }

    if (!chatArg) {
      console.log(
        '\nℹ️  O\'chirish uchun: --chat <chatId> --apply [--count N]',
      );
      return;
    }

    const chatId = chatArg;
    const known = groups.find((g) => String(g.chatId) === chatId);
    console.log(
      `\n🎯 Nishon chat: ${chatId} ${known ? `«${known.title}»` : '(DB da yo\'q)'}`,
    );

    // 1) Probe → oxirgi message_id ni bilish
    const probe = await tg<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text: '⁣', // ko'rinmas belgi
      disable_notification: true,
    });
    if (!probe.ok || !probe.result) {
      console.error('❌ Probe yuborilmadi:', probe.description);
      return;
    }
    const probeId = probe.result.message_id;
    await tg('deleteMessage', { chat_id: chatId, message_id: probeId });
    console.log(`🔎 Probe message_id=${probeId} (yuborildi va o'chirildi)`);

    // 2) Pastga qarab bizning xabarlarni topish
    const mine: number[] = [];
    for (let id = probeId - 1; id > 0 && probeId - id <= scanDepth; id--) {
      const edit = await tg<unknown>('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: id,
        reply_markup: { inline_keyboard: [] },
      });
      const desc = (edit.description ?? '').toLowerCase();
      const isMine = edit.ok || desc.includes('message is not modified');
      const gone =
        desc.includes('message to edit not found') ||
        desc.includes('message identifier is not specified');

      if (isMine) {
        console.log(`   ✅ #${id} — bot xabari`);
        mine.push(id);
        if (mine.length >= howMany) break;
        continue;
      }
      if (gone) {
        console.log(`   ⚪️ #${id} — mavjud emas (o'chirilgan/servis xabari)`);
        continue;
      }
      console.log(`   ⛔️ #${id} — bizning emas (${edit.description}) → to'xtash`);
      break;
    }

    if (mine.length === 0) {
      console.log(
        `\n⚠️  ${scanDepth} ta id ichida botning o'chirilishi mumkin xabari topilmadi ` +
          `(48 soat limiti yoki chat bo'sh).`,
      );
      return;
    }

    if (!apply) {
      console.log(
        `\n🧪 DRY-RUN — o'chirilishi kerak: ${mine.join(', ')}\n` +
          `   Haqiqiy o'chirish uchun --apply qo'shing.`,
      );
      return;
    }

    for (const id of mine) {
      const del = await tg<boolean>('deleteMessage', {
        chat_id: chatId,
        message_id: id,
      });
      console.log(
        del.ok
          ? `🗑  #${id} o'chirildi`
          : `❌ #${id} o'chirilmadi: ${del.description}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
