/**
 * run-retroactive-batch — WRITES to the DB (only with --apply).
 *
 * Runs the real retroactive-billing path for a list of students, but re-checks
 * the safety condition for each one FIRST and skips any that fail it.
 *
 * The condition is not cosmetic. `settleDeferredAccruals` clears a lesson's
 * `salaryDeferred` flag whether or not an accrual was written, and
 * `createAccrual` returns null without a salary config version covering the
 * lesson date. Run over a lesson with no config and the record that the
 * teacher is owed for it disappears with nothing to show for it — 273 May
 * lessons on production are in exactly that state.
 *
 * Usage:
 *   railway run npx ts-node --transpile-only scripts/run-retroactive-batch.ts [--apply]
 *   railway run npx ts-node --transpile-only scripts/run-retroactive-batch.ts 10406 10275 [--apply]
 *
 * With no student ids given it falls back to the cohort baked in below.
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

@Module({
  imports: [EventEmitterModule.forRoot(), PrismaModule, EntityHistoryModule, TransactionsModule],
  providers: [LessonBillingService, SalaryAccrualService],
})
class BatchModule {}

// The cohort this ran against in production on 2026-08-18. Pass student ids as
// arguments to run a different set; the baked list is only the default.
const DEFAULT_IDS = `10406 10275 10466 10688 10509 10083 10541 10615 10461 10629 10553 10606 10455 10591
10635 10643 10489 10595 10605 10689 10439 10285 10607 10611 10597 10336 10670 10649`
  .split(/\s+/).filter(Boolean).map(Number);

const ARG_IDS = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const IDS = ARG_IDS.length ? ARG_IDS : DEFAULT_IDS;

const APPLY = process.argv.includes('--apply');
const f = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

(async () => {
  const app = await NestFactory.createApplicationContext(BatchModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const billing = app.get(LessonBillingService);

  const versions = await prisma.employeeSalaryConfigVersion.findMany({
    where: { config: { isActive: true } },
    select: { effectiveFrom: true, effectiveTo: true, config: { select: { userId: true, groupId: true } } },
  });
  const hasConfig = (tid: number, gid: string, d: Date) =>
    versions.some((v) => v.config.userId === tid && v.effectiveFrom <= d && (!v.effectiveTo || v.effectiveTo > d)
      && (v.config.groupId === gid || v.config.groupId === null));
  const rosters = await prisma.groupTeacher.findMany({ select: { groupId: true, teacherId: true } });
  const teachersOf = new Map<string, number[]>();
  for (const g of rosters) {
    const a = teachersOf.get(g.groupId) ?? []; a.push(g.teacherId); teachersOf.set(g.groupId, a);
  }

  /** The lessons this student's payment would settle, oldest first. */
  const settleSet = async (sid: number) => {
    const s = await prisma.student.findUnique({ where: { id: sid }, select: { balance: true, companyId: true, firstName: true, lastName: true } });
    if (!s) return null;
    const ds = await prisma.transaction.findMany({
      where: { studentId: sid, type: 'LESSON_DEDUCTION', reversedAt: null, metadata: { path: ['salaryDeferred'], equals: true } },
      select: { attendanceId: true, metadata: true }, orderBy: { createdAt: 'asc' },
    });
    const total = ds.reduce((t, d) => t + Math.max(0, Number((d.metadata as any)?.uncoveredAmount ?? 0)), 0);
    let apply = Math.max(0, total - Math.max(0, -s.balance));
    const atts: string[] = [];
    for (const d of ds) {
      if (apply <= 0) break;
      const u = Math.max(0, Number((d.metadata as any)?.uncoveredAmount ?? 0));
      if (u <= 0) continue;
      const ap = Math.min(u, apply); apply -= ap;
      if (ap === u && d.attendanceId) atts.push(d.attendanceId);
    }
    return { s, atts };
  };

  const accrualSum = async (sid: number) =>
    (await prisma.salaryAccrual.aggregate({ where: { studentId: sid, reversedAt: null }, _sum: { amount: true } }))._sum.amount ?? 0;
  const frontedSum = async (sid: number) =>
    (await prisma.salaryAccrual.aggregate({ where: { studentId: sid, reversedAt: null, isCenterTopUp: true }, _sum: { amount: true } }))._sum.amount ?? 0;

  console.log(`${APPLY ? '⚠ YOZUV REJIMI (--apply)' : 'QURUQ ISHLASH (--apply berilmadi)'} · ${IDS.length} o'quvchi\n`);
  console.log("#id     ism                       dars  yangi oylik  markaz tozalandi  holat");
  console.log('──────  ────────────────────────  ────  ───────────  ────────────────  ─────────');

  let okCount = 0, skipped = 0, totalPay = 0, totalCenter = 0;
  const skipDetail: string[] = [];

  for (const sid of IDS) {
    const set = await settleSet(sid);
    if (!set) { skipped++; skipDetail.push(`#${sid} topilmadi`); continue; }
    const { s, atts } = set;
    const name = `${s.firstName} ${s.lastName}`.trim();

    if (atts.length === 0) {
      skipped++; skipDetail.push(`#${sid} ${name} — yopiladigan dars yo'q (allaqachon bajarilgan?)`);
      console.log(`${String(sid).padEnd(6)}  ${name.slice(0,24).padEnd(24)}     0            —                 —  o'tkazildi`);
      continue;
    }

    // SAFETY re-check, right before the write.
    const lessons = await prisma.attendance.findMany({ where: { id: { in: atts } }, select: { id: true, groupId: true, date: true } });
    const noConfig = lessons.filter((l) => {
      const ts = teachersOf.get(l.groupId) ?? [];
      return ts.length > 0 && ts.some((t) => !hasConfig(t, l.groupId, l.date));
    });
    if (noConfig.length > 0) {
      skipped++;
      skipDetail.push(`#${sid} ${name} — ${noConfig.length} darsda oylik konfiguratsiyasi yo'q, TEGILMADI`);
      console.log(`${String(sid).padEnd(6)}  ${name.slice(0,24).padEnd(24)}  ${String(atts.length).padStart(4)}            —                 —  ⛔ SKIP`);
      continue;
    }

    if (!APPLY) {
      console.log(`${String(sid).padEnd(6)}  ${name.slice(0,24).padEnd(24)}  ${String(atts.length).padStart(4)}            ?                 ?  tayyor`);
      okCount++;
      continue;
    }

    const beforeAcc = await accrualSum(sid), beforeFr = await frontedSum(sid);
    await billing.runRetroactiveBilling({ studentId: sid, companyId: s.companyId });
    const afterAcc = await accrualSum(sid), afterFr = await frontedSum(sid);
    const pay = afterAcc - beforeAcc, cleared = beforeFr - afterFr;
    totalPay += pay; totalCenter += cleared; okCount++;
    console.log(`${String(sid).padEnd(6)}  ${name.slice(0,24).padEnd(24)}  ${String(atts.length).padStart(4)}  ${f(pay).padStart(11)}  ${f(cleared).padStart(16)}  ✅`);
  }

  console.log(`\n── XULOSA ──`);
  console.log(`  bajarildi   : ${okCount}`);
  console.log(`  o'tkazildi  : ${skipped}`);
  if (APPLY) {
    console.log(`  yangi ustoz oyligi      : ${f(totalPay)} so'm`);
    console.log(`  markaz avansi tozalandi : ${f(totalCenter)} so'm`);
  }
  if (skipDetail.length) { console.log('\n  o\'tkazilganlar:'); for (const d of skipDetail) console.log(`   · ${d}`); }
  await app.close();
})();
