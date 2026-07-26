/**
 * IYUN OYLIGI — RECONCILIATION & DOUBLE-PAY FORENSIC — READ-ONLY.
 *
 * Aniqlaydi:
 *   1) Iyun darslari uchun ustoz TOPGAN haq (accrual) — jami / iyunda billed / kech billed
 *   2) Tizimda RASMAN yozilgani — SalaryPayment (status, paidAt) + linked/unlinked accrual
 *   3) Haqiqatan berilgani — avans (cash) + (foydalanuvchi: ~66,7M jadval bo'yicha)
 *   4) IYUL run'i qaysi iyun accruallarini olib ketishi mumkin → DOUBLE-PAY xavfi
 *
 * Hech narsa yozmaydi. Faqat holatni ko'rsatadi + tavsiya.
 */
import { PrismaClient } from '@prisma/client';
import { som, dbEnvLabel, printHeader, section, run } from './lib/check-cli';

const COMPANY_ID = 1001;
const OFFSET = 5 * 60 * 60 * 1000;

const JUNE = { gte: new Date(Date.UTC(2026, 5, 1)), lt: new Date(Date.UTC(2026, 6, 1)) };
const JULY = { gte: new Date(Date.UTC(2026, 6, 1)), lt: new Date(Date.UTC(2026, 7, 1)) };
const JULY1_TS = new Date(Date.UTC(2026, 6, 1) - OFFSET);
const JULY1_TS_END = new Date(Date.UTC(2026, 7, 1) - OFFSET);

async function main(prisma: PrismaClient) {
  printHeader('IYUN OYLIGI — RECONCILIATION & DOUBLE-PAY FORENSIC');
  console.log(`  Baza: ${dbEnvLabel()}`);

  // ── 1) Iyun-dars accruallari ──
  const june = await prisma.salaryAccrual.findMany({
    where: { companyId: COMPANY_ID, reversedAt: null, lessonDate: { gte: JUNE.gte, lt: JUNE.lt } },
    select: { amount: true, createdAt: true, salaryPaymentId: true, creditPeriodDate: true },
  });
  const sum = (a: { amount: number }[]) => a.reduce((s, x) => s + x.amount, 0);

  const billedInJune = june.filter((a) => a.createdAt < JULY1_TS);
  const billedLate = june.filter((a) => a.createdAt >= JULY1_TS);
  const linked = june.filter((a) => a.salaryPaymentId != null);
  const unlinked = june.filter((a) => a.salaryPaymentId == null);

  section('1) Iyun darslari — ustoz TOPGAN haq (accrual)');
  console.log(`  JAMI                              : ${som(sum(june))}  (${june.length} ta)`);
  console.log(`    iyunda billed (createdAt<01.07) : ${som(sum(billedInJune))}  (${billedInJune.length})`);
  console.log(`    KECH billed (createdAt>=01.07)  : ${som(sum(billedLate))}  (${billedLate.length})`);

  section('2) Tizimda RASMAN — accrual↔payment bog\'lanishi');
  console.log(`  Payment'ga BOG'LANGAN (salaryPaymentId bor) : ${som(sum(linked))}  (${linked.length})`);
  console.log(`  BOG'LANMAGAN (salaryPaymentId null)         : ${som(sum(unlinked))}  (${unlinked.length})`);

  // June SalaryPayment holati
  const jp = await prisma.salaryPayment.findMany({
    where: { companyId: COMPANY_ID, periodEnd: { gte: new Date('2026-06-15'), lt: new Date('2026-07-15') } },
    select: { id: true, amount: true, status: true, paidAt: true },
  });
  const jpByStatus = new Map<string, { n: number; amt: number; paid: number }>();
  for (const p of jp) {
    const s = jpByStatus.get(p.status) ?? { n: 0, amt: 0, paid: 0 };
    s.n += 1; s.amt += p.amount; if (p.paidAt) s.paid += 1;
    jpByStatus.set(p.status, s);
  }
  console.log('  June SalaryPayment yozuvlari:');
  for (const [st, s] of jpByStatus)
    console.log(`    ${st.padEnd(11)} : net=${som(s.amt)}  (${s.n} ta, paidAt bor: ${s.paid})`);

  // ── 3) Haqiqatan berilgani ──
  const adv = await prisma.expense.aggregate({
    where: { companyId: COMPANY_ID, deletedAt: null, category: 'TEACHER_ADVANCE', date: { gte: JUNE.gte, lt: JUNE.lt } },
    _sum: { amount: true },
  });
  section('3) Haqiqatan chiqqan');
  console.log(`  Avans (cash, TEACHER_ADVANCE, tizimda)  : ${som(adv._sum.amount ?? 0)}`);
  console.log(`  Asosiy oylik PAID (tizimda)             : 0  (paidAt yo'q)`);
  console.log(`  Foydalanuvchi: ~66,7M jadval bo'yicha berilgan (16,3 avans + ~50,4 naqd/karta)`);

  // ── 4) IYUL run'i xavfi ──
  // Iyul run'i (Avgust 1 da) iyul davrini settle qiladi: unpaid accrual,
  // COALESCE(creditPeriodDate, lessonDate) ∈ iyul. Iyun darsi shu filtrga
  // tushsa (creditPeriodDate ∈ iyul) — VA u allaqachon qo'lda to'langan bo'lsa — DOUBLE-PAY.
  const juneLessonToJuly = unlinked.filter(
    (a) => a.creditPeriodDate && a.creditPeriodDate >= JULY1_TS && a.creditPeriodDate < JULY1_TS_END,
  );
  const juneLessonStranded = unlinked.filter(
    (a) => !a.creditPeriodDate || a.creditPeriodDate < JULY1_TS,
  );
  section('4) IYUL run\'i xavfi (unlinked iyun accruallari)');
  console.log(`  creditPeriodDate ∈ IYUL → iyul run olib ketadi : ${som(sum(juneLessonToJuly))}  (${juneLessonToJuly.length})`);
  console.log(`     ⚠️ agar bular qo'lda to'langan bo'lsa → DOUBLE-PAY`);
  console.log(`  effective ∈ iyun (null/iyun) → run OLMAYDI      : ${som(sum(juneLessonStranded))}  (${juneLessonStranded.length})`);
  console.log(`     → cron to'lamaydi; qo'lda to'langan bo'lsa — muvofiq, lekin tizim "unpaid" deb turadi`);

  section('XULOSA & TAVSIYA');
  console.log(`  • Iyun ustoz haqi (jami)      : ${som(sum(june))}`);
  console.log(`  • Tizim RASMAN bog'lagan      : ${som(sum(linked))} (CALCULATED, PAID emas)`);
  console.log(`  • Bog'lanmagan (muallaq)      : ${som(sum(unlinked))}`);
  console.log(`  • Siz bergan (taxm.)          : ~66,7M`);
  console.log('');
  console.log('  Muammo: siz qo\'lda ~66,7M berdingiz, lekin tizim buni PAID deb bilmaydi');
  console.log('  (SalaryPayment paidAt=null; ~10,5M accrual esa umuman bog\'lanmagan).');
  console.log('');
  console.log('  Eng to\'g\'ri yo\'l (keyingi qadam, mutatsiya — tasdiq bilan):');
  console.log('   1. Iyun uchun HAQIQATAN berilgan summani belgilash (SalaryPayment PAID).');
  console.log('   2. Iyunда to\'langan accruallarni o\'sha paymentga bog\'lash (unlinked→linked).');
  console.log('   3. Qolgan (haqiqatan to\'lanmagan) iyun accruallarini IYULga carry qilish.');
  console.log('   4. Shundan keyingina iyul run\'i xavfsiz — double-pay bo\'lmaydi.\n');
}

run(main);
