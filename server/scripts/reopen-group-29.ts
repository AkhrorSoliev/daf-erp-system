/**
 * One-off correction: reopen group #29 (#029) that the nightly status cron
 * auto-completed on 2026-07-13 00:05 (Asia/Tashkent), and restore the 17
 * students it auto-graduated to EXACTLY their pre-closure state.
 *
 * The cron did (2026-07-12 19:05:01 UTC = 2026-07-13 00:05 Tashkent):
 *   - group #29           ACTIVE -> COMPLETED
 *   - 17 enrollments      ACTIVE -> COMPLETED   (reason "Cascade: Group #... -> COMPLETED")
 *   - 17 students         ACTIVE -> GRADUATED   (reason "Avtomatik: guruh tugallanganligi sababli")
 *   - 6 students: prepaid lessons refunded to balance (ADJUSTMENT, +sum), prepaidLessonsRemaining=0
 *
 * This script reverses ALL of the above in a single Serializable tx:
 *   - group   COMPLETED  -> ACTIVE
 *   - the 17 cron-completed enrollments COMPLETED -> ACTIVE
 *   - the 17 auto-graduated students    GRADUATED -> ACTIVE (isActive=true)
 *   - the 6 prepaid refunds reversed via the REAL reverseTransaction()
 *     (balance -sum) and prepaidLessonsRemaining restored -> exact pre-closure.
 *
 * Dry-run by default; pass --apply to mutate.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import { CashMovementsService } from '../src/cash-accounts/cash-movements.service';

@Module({
  imports: [PrismaModule],
  providers: [TransactionsWriteService, CashMovementsService],
})
class ReopenModule {}

const GROUP_ID = 'e3ab4e6b-0563-475b-aa03-f7645a5abc22';
const PER_LESSON = 34500; // 690 000 / 20 — group #29 course price
const CRON_LO = new Date('2026-07-12T19:00:00Z');
const CRON_HI = new Date('2026-07-12T19:10:00Z');
const GRAD_REASON = 'Avtomatik: guruh tugallanganligi sababli';
const REOPEN_REASON =
  "Qo'lda tiklandi: guruh #29 avtomatik yopilishi/graduation bekor qilindi (2026-07-14)";

const APPLY = process.argv.includes('--apply');

async function main() {
  const app = await NestFactory.createApplicationContext(ReopenModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const writeSvc = app.get(TransactionsWriteService);

  console.log(
    `DB: ${new URL(process.env.DATABASE_URL ?? '').host} | Mode: ${
      APPLY ? '*** APPLY ***' : 'DRY RUN'
    }\n`,
  );

  // ── Gather the cron-completed cohort (source of truth) ──────────────────
  const group = await prisma.group.findUnique({
    where: { id: GROUP_ID },
    select: { groupNumber: true, statusEnum: true, companyId: true },
  });
  if (!group) throw new Error('Guruh topilmadi');
  console.log(`Guruh #${group.groupNumber} — hozirgi status: ${group.statusEnum}`);

  const cronEnrolls = await prisma.enrollment.findMany({
    where: {
      groupId: GROUP_ID,
      deletedAt: null,
      status: 'COMPLETED',
      statusChangedById: null,
      statusChangedAt: { gte: CRON_LO, lte: CRON_HI },
    },
    select: { id: true, studentId: true },
  });
  console.log(`Cron yopgan enrollment: ${cronEnrolls.length} (kutilgan: 17)`);
  if (cronEnrolls.length !== 17) {
    throw new Error(`Kutilmagan enrollment soni: ${cronEnrolls.length} — to'xtatildi`);
  }
  const studentIds = [...new Set(cronEnrolls.map((e) => e.studentId))];

  // Students currently GRADUATED by this cron
  const gradStudents = await prisma.student.findMany({
    where: {
      id: { in: studentIds },
      status: 'GRADUATED',
      statusChangeReason: GRAD_REASON,
      statusChangedAt: { gte: CRON_LO, lte: CRON_HI },
    },
    select: { id: true, firstName: true, lastName: true, balance: true, companyId: true },
  });
  console.log(`Avto-GRADUATED o'quvchi (tiklanadi): ${gradStudents.length}`);

  // The 6 prepaid-refund ADJUSTMENTs
  const refunds = await prisma.transaction.findMany({
    where: {
      studentId: { in: studentIds },
      type: 'ADJUSTMENT',
      reversedAt: null,
      createdAt: { gte: new Date('2026-07-12T18:55:00Z'), lte: new Date('2026-07-13T00:00:00Z') },
      description: { contains: `Cascade: Group #${GROUP_ID}` },
    },
    select: { id: true, studentId: true, amount: true, description: true },
    orderBy: { amount: 'desc' },
  });
  console.log(`\nPrepaid refund ADJUSTMENT (teskari qilinadi): ${refunds.length}`);
  let totalRefund = 0;
  const refundPlan: { txId: string; studentId: number; amount: number; lessons: number; enrollmentId: string }[] = [];
  for (const r of refunds) {
    if (r.amount % PER_LESSON !== 0) {
      throw new Error(`#${r.studentId}: summa ${r.amount} ${PER_LESSON} ga bo'linmadi — to'xtatildi`);
    }
    const lessons = r.amount / PER_LESSON;
    const enr = cronEnrolls.find((e) => e.studentId === r.studentId);
    if (!enr) throw new Error(`#${r.studentId}: enrollment topilmadi`);
    totalRefund += r.amount;
    refundPlan.push({ txId: r.id, studentId: r.studentId, amount: r.amount, lessons, enrollmentId: enr.id });
    console.log(`  #${r.studentId}: -${r.amount} balansdan, prepaid=${lessons} dars tiklanadi`);
  }
  console.log(`  Jami teskari qilinadigan: ${totalRefund} so'm`);

  console.log('\n── Bajariladigan o\'zgarishlar ──');
  console.log(`  1) Guruh #${group.groupNumber}: COMPLETED -> ACTIVE`);
  console.log(`  2) ${cronEnrolls.length} enrollment: COMPLETED -> ACTIVE`);
  console.log(`  3) ${gradStudents.length} o'quvchi: GRADUATED -> ACTIVE`);
  console.log(`  4) ${refundPlan.length} prepaid refund teskari + prepaid tiklash`);

  if (!APPLY) {
    console.log('\n(DRY RUN — --apply bilan bajariladi.)');
    await app.close();
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const now = new Date();

      // 4) Reverse the 6 prepaid refunds + restore prepaidLessonsRemaining
      for (const p of refundPlan) {
        await writeSvc.reverseTransaction(
          p.txId,
          { performedById: undefined, reason: `Guruh #${group.groupNumber} qayta ochildi: prepaid tiklandi` },
          tx,
        );
        await tx.enrollment.update({
          where: { id: p.enrollmentId },
          data: { prepaidLessonsRemaining: p.lessons },
        });
      }

      // 2) Reactivate the 17 enrollments
      for (const e of cronEnrolls) {
        await tx.enrollment.update({
          where: { id: e.id },
          data: {
            status: 'ACTIVE',
            statusChangedAt: now,
            statusChangedById: null,
            statusChangeReason: REOPEN_REASON,
          },
        });
        await tx.enrollmentStateLog.create({
          data: { enrollmentId: e.id, status: 'ACTIVE', transitionAt: now, reason: REOPEN_REASON, changedById: null },
        });
      }

      // 3) Un-graduate the 17 students
      for (const s of gradStudents) {
        await tx.student.update({
          where: { id: s.id },
          data: {
            status: 'ACTIVE',
            isActive: true,
            statusChangedAt: now,
            statusChangedById: null,
            statusChangeReason: REOPEN_REASON,
          },
        });
        await tx.statusHistory.create({
          data: {
            entityType: 'Student',
            entityId: String(s.id),
            fromStatus: 'GRADUATED',
            toStatus: 'ACTIVE',
            reason: REOPEN_REASON,
            changedById: null,
            companyId: s.companyId ?? undefined,
          },
        });
      }

      // 1) Reopen the group
      await tx.group.update({
        where: { id: GROUP_ID },
        data: {
          statusEnum: 'ACTIVE',
          status: 1,
          isActive: true,
          statusChangedAt: now,
          statusChangedById: null,
          statusChangeReason: REOPEN_REASON,
        },
      });
      await tx.statusHistory.create({
        data: {
          entityType: 'Group',
          entityId: GROUP_ID,
          fromStatus: 'COMPLETED',
          toStatus: 'ACTIVE',
          reason: REOPEN_REASON,
          changedById: null,
          companyId: group.companyId ?? undefined,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20000, timeout: 120000 },
  );

  console.log('\n✅ APPLIED — tiklash yakunlandi.');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
