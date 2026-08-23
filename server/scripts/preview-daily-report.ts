/**
 * READ-ONLY: renders today's 21:00 Telegram daily report to stdout.
 *
 * Boots a MINIMAL Nest context (Prisma + Reports + Salary + the report
 * service) rather than AppModule — booting AppModule against prod env would
 * start a SECOND admin-bot poller on the same token, and Telegram rejects
 * concurrent getUpdates, which would knock the live bot offline.
 *
 * Usage: railway run npx ts-node scripts/_preview-daily-report.ts
 */
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { EntityHistoryModule } from '../src/common/entity-history/entity-history.module';
import { StatusHistoryModule } from '../src/common/status/status-history.module';
import { RedisModule } from '../src/redis/redis.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsModule } from '../src/reports/reports.module';
import { SalaryModule } from '../src/salary/salary.module';
import { TelegramGroupDailyReportService } from '../src/telegram-groups/telegram-group-daily-report.service';
import { reportBranchIdsForGroup } from '../src/telegram-groups/group-report-scope';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    // @Global() still has to be imported ONCE to be registered. AppModule
    // does that; this context has to repeat it for every global the report's
    // dependency tree reaches (cash accounts, holidays, the expectation cache).
    EntityHistoryModule,
    StatusHistoryModule,
    RedisModule,
    ReportsModule,
    SalaryModule,
  ],
  providers: [TelegramGroupDailyReportService],
})
class PreviewModule {}

(async () => {
  const app = await NestFactory.createApplicationContext(PreviewModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);
  const svc = app.get(TelegramGroupDailyReportService);

  // Preview per APPROVED GROUP, not per company: the report is scoped to the
  // branches each group declared, so "the company's report" is no longer a
  // single thing. Printing one per group is what the cron actually sends.
  const groups = await prisma.telegramGroup.findMany({
    where: {
      status: 'APPROVED',
      isActive: true,
      deletedAt: null,
      companyId: { not: null },
    },
    select: {
      id: true,
      companyId: true,
      branchId: true,
      receivesAllBranches: true,
      title: true,
    },
  });
  for (const g of groups) {
    if (!g.companyId) continue;
    const branchIds = reportBranchIdsForGroup(g);
    const built = await svc.build(g.companyId, branchIds);
    const scope = branchIds ? `filial ${branchIds.join(',')}` : 'barcha filiallar';
    console.log(
      `\n${'='.repeat(64)}\n${g.title ?? g.id} (companyId=${g.companyId}, ${scope})\n${'='.repeat(64)}\n`,
    );
    // Strip the HTML the bot sends so the terminal shows what a reader sees.
    console.log(
      built.message
        .replace(/<b>|<\/b>/g, '')
        .replace(/<i>|<\/i>/g, '')
        .replace(/<code>|<\/code>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>'),
    );
    console.log(`\n--- bu kecha 23:40 da saqlanadigan surat ---`);
    console.log(JSON.stringify(built.snapshot, null, 2));
  }
  await app.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
