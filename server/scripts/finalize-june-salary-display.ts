/**
 * IYUN OYLIGINI SIZ BERGAN SUMMAGA KELTIRISH — data fix.
 * Default: DRY-RUN. `--execute` yozadi (bitta tx) + keyin getMonthly bilan tekshiradi.
 *
 * Maqsad: salary sahifasi/Excel/card iyun uchun SIZ BERGAN summani ko'rsatsin:
 *   covered 66,7M · avans 16,3M · to'lanadigan 50,4M · gap yashirin.
 *
 * Ikki data o'zgarish (CALCULATED payment'lar — ledger/balansga TEGMAYDI):
 *  1) creditPeriodDate: iyun payment'iga bog'langan, lekin IYULga carry bo'lgan
 *     accruallarni IYUNga qaytarish (siz ularni iyunda to'lagansiz) → covered 66,7M.
 *  2) iyun payment.amount ni siz bergan net summaga (to'lanadigan) yangilash → netToPay 50,4M.
 */
import { PrismaClient } from '@prisma/client';
import { som, dbEnvLabel, printHeader, section, run } from './lib/check-cli';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalaryStaffMonthlyService } from '../src/salary/salary-monthly-staff.service';
import { SalaryMonthlyService } from '../src/salary/salary-monthly.service';

const COMPANY_ID = 1001;
const EXECUTE = process.argv.includes('--execute');
const OFFSET = 5 * 60 * 60 * 1000;
const JUNE_PERIOD_END = new Date(Date.UTC(2026, 5, 30, 23, 59, 59) - OFFSET); // ~Tashkent 30.06 23:59
// Jadval (rasm) — har ustoz siz bergan NET (to'lanadigan):
const PAID_NET: Record<number, number> = {
  10010: 17_733_500, 10008: 6_966_825, 10007: 6_500_138, 10006: 3_466_796,
  10003: 6_400_128, 10005: 4_666_794, 10014: 719_912, 10002: 2_266_712,
  10473: 1_599_960, 10505: 66_665,
};

async function main(prismaClient: PrismaClient) {
  const prisma = prismaClient as unknown as PrismaService;
  printHeader(`IYUN OYLIGI — SIZ BERGAN SUMMAGA (${EXECUTE ? 'EXECUTE' : 'DRY-RUN'})`);
  console.log(`  Baza: ${dbEnvLabel()}`);

  // Iyun payment'lari
  const payments = await prisma.salaryPayment.findMany({
    where: { companyId: COMPANY_ID, periodEnd: { gte: new Date('2026-06-20'), lt: new Date('2026-07-10') } },
    select: { id: true, userId: true, amount: true },
  });
  const paymentIds = payments.map((p) => p.id);

  // (1) IYULga carry bo'lgan, lekin iyun payment'iga bog'langan accruallar → IYUNga qaytar
  const carriedButPaid = await prisma.salaryAccrual.findMany({
    where: {
      companyId: COMPANY_ID,
      reversedAt: null,
      salaryPaymentId: { in: paymentIds },
      creditPeriodDate: { gt: JUNE_PERIOD_END }, // iyul (yoki keyin) davriga chiqarilgan
    },
    select: { id: true, amount: true },
  });
  const backToJune = carriedButPaid.reduce((s, a) => s + a.amount, 0);

  // (2) payment amount yangilanishi (per ustoz: primary = paidNet − boshqalar)
  const byTeacher = new Map<number, typeof payments>();
  for (const p of payments) {
    const arr = byTeacher.get(p.userId) ?? [];
    arr.push(p); byTeacher.set(p.userId, arr);
  }
  const amountUpdates: { id: string; oldAmount: number; newAmount: number; userId: number }[] = [];
  for (const [uid, ps] of byTeacher) {
    const paidNet = PAID_NET[uid];
    if (paidNet == null) continue;
    const sorted = ps.slice().sort((a, b) => b.amount - a.amount);
    const primary = sorted[0];
    const othersNet = sorted.slice(1).reduce((s, p) => s + p.amount, 0);
    const newAmount = paidNet - othersNet;
    if (newAmount !== primary.amount)
      amountUpdates.push({ id: primary.id, oldAmount: primary.amount, newAmount, userId: uid });
  }

  section('Reja');
  console.log(`  (1) IYUNga qaytariladigan accrual (creditPeriodDate→null): ${som(backToJune)}  (${carriedButPaid.length} ta)`);
  console.log(`  (2) payment.amount yangilanadi: ${amountUpdates.length} ta payment`);
  for (const u of amountUpdates) {
    console.log(`       #${u.userId}: ${som(u.oldAmount)} → ${som(u.newAmount)}`);
  }
  const newNetTotal = [...byTeacher.keys()].reduce((s, uid) => s + (PAID_NET[uid] ?? 0), 0);
  console.log(`  Yangi net jami (to'lanadigan): ${som(newNetTotal)}  (kutilgan 50 387 430)`);

  if (!EXECUTE) {
    console.log('\n  DRY-RUN — yozilmadi. Bajarish: --execute\n');
    return;
  }

  console.log('\n  ⚙️ EXECUTE...');
  await prisma.$transaction(async (tx) => {
    if (carriedButPaid.length) {
      await tx.salaryAccrual.updateMany({
        where: { id: { in: carriedButPaid.map((a) => a.id) } },
        data: { creditPeriodDate: null },
      });
    }
    for (const u of amountUpdates) {
      await tx.salaryPayment.update({ where: { id: u.id }, data: { amount: u.newAmount } });
    }
  }, { timeout: 30000 });
  console.log('  ✅ Bajarildi.');

  // ─── Tekshiruv: getMonthly qayta ishga tushirib, iyun natijasini ko'rsatish ──
  const staff = new SalaryStaffMonthlyService(prisma);
  const salaryMonthly = new SalaryMonthlyService(prisma, staff);
  const ceo = await prisma.user.findFirst({
    where: { companyId: COMPANY_ID, deletedAt: null, roles: { some: { role: { name: 'CEO' } } } },
    select: { id: true },
  });
  const sm = await salaryMonthly.getMonthly({ month: '2026-06' }, COMPANY_ID, ceo!.id);
  section('TEKSHIRUV — getMonthly iyun (endi card/Excel/sahifa shuni ko\'rsatadi)');
  console.log(`  covered (O'quvchilar to'lagan) : ${som(sm.totals.covered)}   (kutilgan ~66 704 430)`);
  console.log(`  gap (markaz qo'shimchasi)      : ${som(sm.totals.gap)}   (kutilgan 0 — pre-iyul)`);
  console.log(`  fullDeserved                   : ${som(sm.totals.fullDeserved)}`);
  console.log(`  netToPay (to'lanadigan)        : ${som(sm.totals.netToPay)}   (kutilgan ~50 387 430)`);
  console.log(`  advances (avans)               : ${som(sm.totals.advances)}   (kutilgan 16 317 000)`);
  console.log('');
}

run(main);
