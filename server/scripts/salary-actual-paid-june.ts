/**
 * IYUN OYLIGI — HAQIQATDA QANCHA BERILDI — READ-ONLY.
 *
 * Savol: rasmdagi jadval (66,7 covered / 50,4 to'lanadigan) asosida oylik
 * berilgan bo'lsa — iyun uchun NOTO'G'RI oylik berilganmi?
 *
 * Buni aniqlash uchun HAQIQIY SalaryPayment yozuvlarini ko'ramiz:
 *   - status (CALCULATED/APPROVED/PAID/CANCELLED), paidAt (haqiqatan berilganmi)
 *   - amount (net), settled avans → gross
 *   - qaysi davr (periodStart..periodEnd)
 *
 * Hech narsa yozmaydi.
 */
import { PrismaClient } from '@prisma/client';
import { som, day, dbEnvLabel, printHeader, section, run } from './lib/check-cli';

const COMPANY_ID = 1001;

async function main(prisma: PrismaClient) {
  printHeader('IYUN OYLIGI — HAQIQATDA QANCHA BERILDI');
  console.log(`  Baza: ${dbEnvLabel()}`);

  // Iyun/iyul atrofidagi barcha SalaryPayment yozuvlari
  const payments = await prisma.salaryPayment.findMany({
    where: {
      companyId: COMPANY_ID,
      periodEnd: { gte: new Date('2026-05-15'), lte: new Date('2026-08-15') },
    },
    select: {
      id: true, userId: true, amount: true, status: true, paidAt: true,
      periodStart: true, periodEnd: true,
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ periodStart: 'asc' }, { userId: 'asc' }],
  });

  // Settled avans har bir payment uchun
  const settled = await prisma.expense.groupBy({
    by: ['settledBySalaryPaymentId'],
    where: { settledBySalaryPaymentId: { in: payments.map((p) => p.id) } },
    _sum: { amount: true },
  });
  const advOf = new Map(settled.map((s) => [s.settledBySalaryPaymentId, s._sum.amount ?? 0]));

  // Davr bo'yicha guruhlash (periodStart oyi)
  const byPeriod = new Map<string, typeof payments>();
  for (const p of payments) {
    const k = `${day(p.periodStart)} … ${day(p.periodEnd)}`;
    const arr = byPeriod.get(k) ?? [];
    arr.push(p);
    byPeriod.set(k, arr);
  }

  for (const [period, ps] of byPeriod) {
    section(`Davr: ${period}`);
    const byStatus = new Map<string, { net: number; gross: number; n: number; paidN: number }>();
    for (const p of ps) {
      const adv = advOf.get(p.id) ?? 0;
      const s = byStatus.get(p.status) ?? { net: 0, gross: 0, n: 0, paidN: 0 };
      s.net += p.amount;
      s.gross += p.amount + adv;
      s.n += 1;
      if (p.paidAt) s.paidN += 1;
      byStatus.set(p.status, s);
    }
    for (const [st, s] of byStatus) {
      console.log(`  ${st.padEnd(11)} : net=${som(s.net).padStart(13)}  gross=${som(s.gross).padStart(13)}  (${s.n} ta, paidAt bor: ${s.paidN})`);
    }
  }

  // Umumiy: haqiqatan PAID bo'lgani
  section('UMUMIY — status bo\'yicha (barcha davrlar)');
  const all = new Map<string, { net: number; gross: number; n: number; paidN: number }>();
  for (const p of payments) {
    const adv = advOf.get(p.id) ?? 0;
    const s = all.get(p.status) ?? { net: 0, gross: 0, n: 0, paidN: 0 };
    s.net += p.amount; s.gross += p.amount + adv; s.n += 1; if (p.paidAt) s.paidN += 1;
    all.set(p.status, s);
  }
  for (const [st, s] of all) {
    console.log(`  ${st.padEnd(11)} : net=${som(s.net).padStart(13)}  gross=${som(s.gross).padStart(13)}  (${s.n} ta, paidAt bor: ${s.paidN})`);
  }

  // Haqiqatan cash chiqqan avans (iyun)
  const juneAdv = await prisma.expense.aggregate({
    where: {
      companyId: COMPANY_ID, deletedAt: null, category: 'TEACHER_ADVANCE',
      date: { gte: new Date(Date.UTC(2026, 5, 1)), lt: new Date(Date.UTC(2026, 6, 1)) },
    },
    _sum: { amount: true },
  });

  section('Xulosa');
  console.log(`  Iyunda berilgan AVANS (cash, TEACHER_ADVANCE) : ${som(juneAdv._sum.amount ?? 0)}`);
  const paidTotal = all.get('PAID');
  console.log(`  Status=PAID (haqiqatan "berildi" belgilangan) : ${som(paidTotal?.gross ?? 0)} gross  (${paidTotal?.n ?? 0} ta)`);
  console.log('');
  console.log('  → Agar PAID=0 va paidAt yo\'q bo\'lsa: tizimda asosiy oylik hali');
  console.log('    RASMAN "berildi" deb belgilanmagan (faqat avans cash chiqqan).');
  console.log('    "Berilgan" desangiz — qo\'lda/naqd berilgan, tizimga PAID yozilmagan bo\'lishi mumkin.\n');
}

run(main);
