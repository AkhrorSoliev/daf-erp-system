/**
 * One-off: re-send the 21:00 daily Telegram report to every approved active
 * group RIGHT NOW, using the deployed report-build logic. Run against prod via:
 *
 *   railway run npx ts-node scripts/send-daily-report-now.ts
 *
 * Sends only (no bot.launch()), so it does not conflict with the prod admin
 * bot's polling. Bypasses the lastDailyReportAt idempotency guard on purpose
 * (this is an explicit re-send). Persists tonight's snapshot like the cron does.
 */
import { PrismaClient, TelegramGroupStatus } from '@prisma/client';
import { reportBranchIdsForGroup } from '../src/telegram-groups/group-report-scope';
import { PrismaPg } from '@prisma/adapter-pg';
import { Telegraf, Markup } from 'telegraf';
import { TelegramGroupDailyReportService } from '../src/telegram-groups/telegram-group-daily-report.service';
import { SalaryMonthlyService } from '../src/salary/salary-monthly.service';

async function main() {
  const token = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
  if (!token) {
    console.error('❌ TELEGRAM_ADMIN_BOT_TOKEN yo‘q — bot ishga tushmaydi.');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const bot = new Telegraf(token); // send-only; do NOT launch (avoid polling clash)
  const salaryMonthly = new SalaryMonthlyService(prisma as any);
  const dailyReport = new TelegramGroupDailyReportService(
    prisma as any,
    salaryMonthly,
  );
  const moreButton = Markup.inlineKeyboard([
    [Markup.button.callback("📊 Ko'proq imkoniyatlar", 'rm:open')],
  ]).reply_markup;

  const groups = await prisma.telegramGroup.findMany({
    where: {
      status: TelegramGroupStatus.APPROVED,
      isActive: true,
      deletedAt: null,
      companyId: { not: null },
    },
  });
  console.log(`ℹ️  ${groups.length} ta tasdiqlangan faol guruh topildi.`);

  let sent = 0;
  for (const g of groups) {
    if (!g.companyId) continue;
    try {
      const { message, snapshot } = await dailyReport.build(
        g.companyId,
        reportBranchIdsForGroup(g),
      );
      await bot.telegram.sendMessage(g.chatId.toString(), message, {
        parse_mode: 'HTML',
        reply_markup: moreButton,
      });
      await dailyReport.persistSnapshot(g.companyId, snapshot);
      sent += 1;
      console.log(`✅ Yuborildi → chat ${g.chatId} (kompaniya ${g.companyId})`);
    } catch (err: any) {
      console.error(
        `❌ Xato → chat ${g.chatId}: ${err?.message ?? err}`,
      );
    }
  }

  console.log(`\n🏁 Tayyor: ${sent}/${groups.length} guruhga yuborildi.`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
