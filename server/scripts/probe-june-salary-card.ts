/**
 * probe-june-salary-card — READ-ONLY. Prints EXACTLY what the /payments/overview
 * "Ustoz oyliklari" card will show for a month (default 2026-06), by calling the
 * SAME SalaryMonthlyService.getMonthly the card AND the Excel "Oyliklar" sheet
 * use. So the printed netToPay / advances / gross are byte-for-byte what the card
 * renders and what the downloaded Excel JAMI row shows.
 *
 * Usage:
 *   railway run npx ts-node scripts/probe-june-salary-card.ts            (prod, 2026-06)
 *   railway run npx ts-node scripts/probe-june-salary-card.ts 2026-06    (explicit month)
 *   npx ts-node scripts/probe-june-salary-card.ts                        (dev/.env)
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalaryMonthlyService } from '../src/salary/salary-monthly.service';
import { SalaryStaffMonthlyService } from '../src/salary/salary-monthly-staff.service';
import { som, dbEnvLabel, dbHost } from './lib/check-cli';

// Minimal DI context — only Prisma + the two salary services. NO AppModule, so
// no crons / telegram bots / HTTP server are started.
@Module({
  imports: [PrismaModule],
  providers: [SalaryMonthlyService, SalaryStaffMonthlyService],
})
class ProbeModule {}

async function main() {
  const argMonth = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a));
  const MONTH = argMonth ?? '2026-06';

  const app = await NestFactory.createApplicationContext(ProbeModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const salary = app.get(SalaryMonthlyService);

  // A CEO id → getMonthly scopes to ALL branches (same as the Excel export).
  const ceo = await prisma.user.findFirst({
    where: { deletedAt: null, roles: { some: { role: { name: 'CEO' } } } },
    select: { id: true, companyId: true, firstName: true, lastName: true },
  });
  if (!ceo) {
    console.log('CEO topilmadi — bekor qilindi.');
    await app.close();
    return;
  }

  const res = await salary.getMonthly({ month: MONTH }, ceo.companyId, ceo.id);
  const t = res.totals;
  const gross = t.netToPay + t.advances;
  const hasLessonData =
    (t.fullDeserved ?? 0) !== 0 ||
    (t.covered ?? 0) !== 0 ||
    (t.gap ?? 0) !== 0;

  console.log('═'.repeat(72));
  console.log(`  USTOZ OYLIKLARI KARTASI — ${res.month}   [${dbEnvLabel()} · ${dbHost()}]`);
  console.log(`  scope: CEO #${ceo.id} (${ceo.firstName} ${ceo.lastName}) → barcha filiallar`);
  console.log('═'.repeat(72));
  console.log(`  Ustozlar (qatorlar):            ${res.data.length}`);
  console.log(`  hasLessonData:                  ${hasLessonData}`);
  console.log('  ───────────────  KARTA KO\'RSATADI  ───────────────');
  console.log(`  a) Sof oylik (avanssiz):        ${som(t.netToPay)} so'm   [netToPay]`);
  console.log(`  b) Avans (jami):                ${som(t.advances)} so'm   [advances]`);
  console.log(`  c) Jami (avans + oylik):        ${som(gross)} so'm   [netToPay + advances]`);
  console.log('  ───────────  EXCEL "OYLIKLAR" USTUNLARI  ──────────');
  console.log(`  O'quvchilar to'lagan (covered): ${som(t.covered)} so'm`);
  console.log(`  Markaz qo'shimchasi (gap):      ${som(t.gap)} so'm`);
  console.log(`  Jami hisoblangan (fullDeserved):${som(t.fullDeserved)} so'm`);
  console.log('═'.repeat(72));

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
