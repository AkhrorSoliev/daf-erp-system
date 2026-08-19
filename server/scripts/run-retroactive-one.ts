/**
 * run-retroactive-one — WRITES to the DB.
 *
 * Runs the real `POST /billing/retroactive/:studentId` code path for ONE
 * student, printing a before/after snapshot of exactly what moved: balance,
 * open deferred deductions, salary accruals, and the center's advance flag.
 *
 * Usage:
 *   cd server && railway run npx ts-node --transpile-only \
 *     scripts/run-retroactive-one.ts <studentId> [--apply]
 *
 * Without --apply it only prints the snapshot and exits (no write).
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TransactionsModule } from '../src/transactions/transactions.module';
import { SalaryAccrualService } from '../src/salary/salary-accrual.service';
import { EntityHistoryModule } from '../src/common/entity-history/entity-history.module';
import { LessonBillingService } from '../src/billing/lesson-billing.service';

/**
 * Minimal module on purpose: booting AppModule against PROD would also start
 * the Telegram bot and register every @Cron job. This wires only the billing
 * path under test — the same services the HTTP endpoint resolves.
 */
@Module({
  imports: [EventEmitterModule.forRoot(), PrismaModule, EntityHistoryModule, TransactionsModule],
  providers: [LessonBillingService, SalaryAccrualService],
})
class RetroModule {}

const f = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
const SID = Number(process.argv[2]);
const APPLY = process.argv.includes('--apply');

async function snapshot(prisma: PrismaService, sid: number) {
  const [s, deferred, accruals] = await Promise.all([
    prisma.student.findUnique({ where: { id: sid }, select: { balance: true, companyId: true, firstName: true, lastName: true } }),
    prisma.transaction.findMany({
      where: { studentId: sid, type: 'LESSON_DEDUCTION', reversedAt: null, metadata: { path: ['salaryDeferred'], equals: true } },
      select: { id: true, attendanceId: true, metadata: true },
    }),
    prisma.salaryAccrual.findMany({
      where: { studentId: sid, reversedAt: null },
      select: { lessonDate: true, userId: true, amount: true, isCenterTopUp: true, wasCenterTopUp: true,
                deductionTransactionId: true, creditPeriodDate: true },
      orderBy: { lessonDate: 'asc' },
    }),
  ]);
  const openUncovered = deferred.reduce((t, d) => t + Math.max(0, Number((d.metadata as any)?.uncoveredAmount ?? 0)), 0);
  return { s, deferred, accruals, openUncovered };
}

function print(label: string, snap: Awaited<ReturnType<typeof snapshot>>) {
  console.log(`\n──── ${label} ────`);
  console.log(`  balans                       : ${f(snap.s!.balance)}`);
  console.log(`  ochiq kechiktirilgan darslar : ${snap.deferred.length} → ${f(snap.openUncovered)} so'm`);
  console.log(`  accruallar                   : ${snap.accruals.length} → ${f(snap.accruals.reduce((t, a) => t + a.amount, 0))} so'm`);
  console.log(`    markaz zimmasida (isCenterTopUp): ${snap.accruals.filter((a) => a.isCenterTopUp).length} → ${f(snap.accruals.filter((a) => a.isCenterTopUp).reduce((t, a) => t + a.amount, 0))}`);
  console.log(`    deduction bog'langan            : ${snap.accruals.filter((a) => a.deductionTransactionId).length}`);
  console.log('  dars        o\'qit.  summa    markazda  deduction  kredit davri');
  for (const a of snap.accruals)
    console.log(`  ${a.lessonDate.toISOString().slice(0,10)}  ${String(a.userId).padEnd(6)}  ${f(a.amount).padStart(7)}  ${(a.isCenterTopUp ? 'HA' : '—').padStart(8)}  ${(a.deductionTransactionId ? 'bor' : '—').padStart(9)}  ${a.creditPeriodDate ? a.creditPeriodDate.toISOString().slice(0,10) : '—'}`);
}

(async () => {
  if (!Number.isFinite(SID)) { console.log('Usage: run-retroactive-one.ts <studentId> [--apply]'); process.exit(1); }
  const app = await NestFactory.createApplicationContext(RetroModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const billing = app.get(LessonBillingService);

  const before = await snapshot(prisma, SID);
  if (!before.s) { console.log(`#${SID} topilmadi`); await app.close(); return; }
  console.log(`\n═══ O'QUVCHI #${SID} — ${before.s.firstName} ${before.s.lastName} ═══`);
  print('OLDIN', before);

  if (!APPLY) {
    console.log('\n(--apply berilmadi — hech narsa yozilmadi)');
    await app.close();
    return;
  }

  console.log('\n>>> runRetroactiveBilling ishga tushmoqda...');
  const res = await billing.runRetroactiveBilling({ studentId: SID, companyId: before.s.companyId });
  console.log(`>>> natija: billedAttendances=${res.billedAttendances}`);

  const after = await snapshot(prisma, SID);
  print('KEYIN', after);

  console.log('\n──── O\'ZGARISH ────');
  console.log(`  balans                : ${f(before.s.balance)} → ${f(after.s!.balance)}`);
  console.log(`  kechiktirilgan darslar: ${before.deferred.length} → ${after.deferred.length}  (${f(before.openUncovered)} → ${f(after.openUncovered)})`);
  const bTop = before.accruals.filter((a) => a.isCenterTopUp).reduce((t, a) => t + a.amount, 0);
  const aTop = after.accruals.filter((a) => a.isCenterTopUp).reduce((t, a) => t + a.amount, 0);
  console.log(`  markaz zimmasida      : ${f(bTop)} → ${f(aTop)}  (tozalandi: ${f(bTop - aTop)})`);
  const bAcc = before.accruals.reduce((t, a) => t + a.amount, 0);
  const aAcc = after.accruals.reduce((t, a) => t + a.amount, 0);
  console.log(`  jami accrual          : ${f(bAcc)} → ${f(aAcc)}  (yangi oylik: ${f(aAcc - bAcc)})`);
  await app.close();
})();
