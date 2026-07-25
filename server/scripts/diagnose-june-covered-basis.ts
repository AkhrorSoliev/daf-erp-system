/**
 * IYUN COVERED — BAZA/VAQT DIAGNOSTIKASI — READ-ONLY.
 *
 * Nega ustoz oyligi jadvalda 66,7 mln, breakdown'da 72,3 mln?
 * Ikki gipoteza:
 *   (a) BUCKETING — carry-over (creditPeriodDate) tufayli boshqacha guruhlangan
 *   (b) VAQT      — covered kech to'lovlar bilan o'sib boradi; jadval eski snapshot
 *
 * Hech narsa yozmaydi.
 */
import { PrismaClient } from '@prisma/client';
import { som, dbEnvLabel, printHeader, section, run } from './lib/check-cli';

const COMPANY_ID = 1001;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const JUNE = { gte: new Date(Date.UTC(2026, 5, 1)), lt: new Date(Date.UTC(2026, 6, 1)) }; // @db.Date
const JULY1_TS = new Date(Date.UTC(2026, 6, 1) - TASHKENT_OFFSET_MS); // Tashkent 2026-07-01 00:00
const JUNE1_TS = new Date(Date.UTC(2026, 5, 1) - TASHKENT_OFFSET_MS);

async function main(prisma: PrismaClient) {
  printHeader('IYUN COVERED — BUCKETING vs VAQT');
  console.log(`  Baza: ${dbEnvLabel()}`);
  console.log(`  Hozir (now): ${new Date().toISOString()}`);

  // Barcha iyun-dars accruallari (lessonDate ∈ iyun, reversedAt null)
  const juneAcc = await prisma.salaryAccrual.findMany({
    where: { companyId: COMPANY_ID, reversedAt: null, lessonDate: { gte: JUNE.gte, lt: JUNE.lt } },
    select: { amount: true, createdAt: true, creditPeriodDate: true, isCenterTopUp: true },
  });

  const sum = (arr: { amount: number }[]) => arr.reduce((s, a) => s + a.amount, 0);

  const total = sum(juneAcc);
  console.log('');
  section('1) Iyun-dars accruallari (lessonDate ∈ iyun)');
  console.log(`  JAMI                      : ${som(total)}  (${juneAcc.length} ta)`);

  // Vaqt bo'yicha: iyun ichida yozilgan vs iyundan keyin (kech to'lov)
  const onTime = juneAcc.filter((a) => a.createdAt < JULY1_TS);
  const late = juneAcc.filter((a) => a.createdAt >= JULY1_TS);
  console.log(`    createdAt < 01.07 (o'z vaqtida) : ${som(sum(onTime))}  (${onTime.length} ta)`);
  console.log(`    createdAt >= 01.07 (KECH billed): ${som(sum(late))}  (${late.length} ta)`);
  console.log(`    → jadval iyun/iyul boshida yasalgan bo'lsa, "kech" qismi unda YO'Q edi`);

  // Carry-over: creditPeriodDate holati
  const noCredit = juneAcc.filter((a) => a.creditPeriodDate == null);
  const withCredit = juneAcc.filter((a) => a.creditPeriodDate != null);
  console.log('');
  section('2) Carry-over (creditPeriodDate) — iyun darslari ichida');
  console.log(`    creditPeriodDate = null (oddiy)     : ${som(sum(noCredit))}  (${noCredit.length} ta)`);
  console.log(`    creditPeriodDate SET (boshqa davrga): ${som(sum(withCredit))}  (${withCredit.length} ta)`);
  if (withCredit.length) {
    const months = new Map<string, number>();
    for (const a of withCredit) {
      const k = a.creditPeriodDate!.toISOString().slice(0, 7);
      months.set(k, (months.get(k) ?? 0) + a.amount);
    }
    for (const [k, v] of months) console.log(`        → ${k}: ${som(v)}`);
  }

  // Carry-INTO-June: lessonDate NOT in June but creditPeriodDate ∈ June
  const carriedIn = await prisma.salaryAccrual.findMany({
    where: {
      companyId: COMPANY_ID,
      reversedAt: null,
      creditPeriodDate: { gte: JUNE1_TS, lt: JULY1_TS },
      NOT: { lessonDate: { gte: JUNE.gte, lt: JUNE.lt } },
    },
    select: { amount: true },
  });
  console.log('');
  section('3) Boshqa oy darsi, iyun davriga carry-IN (creditPeriodDate ∈ iyun)');
  console.log(`    JAMI                      : ${som(sum(carriedIn))}  (${carriedIn.length} ta)`);

  // getMonthly-uslub covered (carry-over OR filtri)
  const getMonthlyStyle = await prisma.salaryAccrual.findMany({
    where: {
      companyId: COMPANY_ID,
      reversedAt: null,
      OR: [
        { creditPeriodDate: { gte: JUNE1_TS, lt: JULY1_TS } },
        { creditPeriodDate: null, lessonDate: { gte: JUNE.gte, lt: JUNE.lt } },
      ],
    },
    select: { amount: true },
  });

  console.log('');
  section('4) XULOSA — uch xil "iyun covered" (bir vaqtda, hozir)');
  console.log(`  A) STRICT lessonDate ∈ iyun            : ${som(total)}`);
  console.log(`  B) getMonthly-uslub (carry-over OR)    : ${som(sum(getMonthlyStyle))}`);
  console.log(`  C) Jadvaldagi (rasm)                   : ${som(66_704_430)}`);
  console.log('');
  console.log(`  A − B (carry-over farqi)  : ${som(total - sum(getMonthlyStyle))}`);
  console.log(`  A − C (jadvaldan farq)    : ${som(total - 66_704_430)}`);
  console.log(`  "kech billed" (createdAt>=01.07): ${som(sum(late))}`);
  console.log('');
  console.log('  Talqin:');
  console.log('   • Agar A−C ≈ "kech billed" bo\'lsa → VAQT (jadval eski snapshot, covered o\'sgan).');
  console.log('   • Agar A−B katta bo\'lsa → carry-over BUCKETING farqi.');
  console.log('   • Ikkalasi ham bo\'lishi mumkin.\n');
}

run(main);
