/**
 * VERIFY June salary FREEZE (carry-over) — READ-ONLY.
 * Does the existing carry-over already freeze June? I.e. do LATE June-lesson
 * accruals (billed after June closed) get creditPeriodDate = a LATER period,
 * so getMonthly's June covered does NOT keep growing?
 */
import { PrismaClient } from '@prisma/client';
import { som, dbEnvLabel, printHeader, section, run } from './lib/check-cli';

const COMPANY_ID = 1001;
const OFFSET = 5 * 60 * 60 * 1000;
const JUNE = { gte: new Date(Date.UTC(2026, 5, 1)), lt: new Date(Date.UTC(2026, 6, 1)) };
const JULY1_TS = new Date(Date.UTC(2026, 6, 1) - OFFSET);

async function main(prisma: PrismaClient) {
  printHeader('IYUN MUZLATISH TEKSHIRUVI (carry-over)');
  console.log(`  Baza: ${dbEnvLabel()}`);

  const june = await prisma.salaryAccrual.findMany({
    where: { companyId: COMPANY_ID, reversedAt: null, lessonDate: { gte: JUNE.gte, lt: JUNE.lt } },
    select: { amount: true, createdAt: true, creditPeriodDate: true },
  });
  const sum = (a: { amount: number }[]) => a.reduce((s, x) => s + x.amount, 0);
  // Tashkent month key — creditPeriodDate is stored as the Tashkent period start
  // (e.g. 2026-06-30T19:00Z = Tashkent 01.07), so shift by offset before slicing.
  const monthOf = (d: Date | null) =>
    d ? new Date(d.getTime() + OFFSET).toISOString().slice(0, 7) : 'null';

  const late = june.filter((a) => a.createdAt >= JULY1_TS);
  const onTime = june.filter((a) => a.createdAt < JULY1_TS);

  section('Iyun darslari — createdAt bo\'yicha');
  console.log(`  O'z vaqtida billed (createdAt < 01.07): ${som(sum(onTime))}  (${onTime.length})`);
  console.log(`  KECH billed (createdAt >= 01.07)       : ${som(sum(late))}  (${late.length})`);

  section('KECH billed accruallar — creditPeriodDate (qayerga carry bo\'lgan?)');
  const byCredit = new Map<string, { amount: number; n: number }>();
  for (const a of late) {
    const k = monthOf(a.creditPeriodDate);
    const e = byCredit.get(k) ?? { amount: 0, n: 0 };
    e.amount += a.amount; e.n += 1; byCredit.set(k, e);
  }
  for (const [k, e] of [...byCredit.entries()].sort()) {
    const tag = k === 'null' || k === '2026-06' ? '← IYUNDA qoladi (muzlamagan!)' : '→ keyingi oyga carry (muzlatilgan ✓)';
    console.log(`    creditPeriodDate ${k}: ${som(e.amount)}  (${e.n})  ${tag}`);
  }

  section('XULOSA');
  const stuckInJune = late
    .filter((a) => !a.creditPeriodDate || monthOf(a.creditPeriodDate) === '2026-06')
    .reduce((s, a) => s + a.amount, 0);
  const carriedOut = sum(late) - stuckInJune;
  console.log(`  Kech to'lovlardan IYULga (yoki keyin) carry bo'lgan : ${som(carriedOut)}`);
  console.log(`  Kech to'lovlardan hali IYUNda qolgan               : ${som(stuckInJune)}`);
  if (stuckInJune === 0) {
    console.log(`  ✅ Iyun MUZLAGAN — barcha kech to'lovlar keyingi oyga o'tgan. getMonthly June o'smaydi.`);
  } else {
    console.log(`  ⚠️ ${som(stuckInJune)} kech to'lov hali iyunda — muzlatish to'liq emas.`);
  }
  console.log('');
}

run(main);
