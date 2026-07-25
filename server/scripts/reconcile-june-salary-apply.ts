/**
 * IYUN OYLIGI RECONCILIATION — MINIMAL-SAFE (faqat accrual bog'lash).
 *
 * Default: DRY-RUN (yozmaydi). `--execute` bilan yozadi (bitta tx).
 *
 * FAQAT bitta narsa qiladi: iyunда QO'LDA to'langan (jadval bo'yicha) accruallarni
 * o'z ustozining iyun SalaryPayment'iga bog'laydi (salaryPaymentId).
 *   → iyul cron bu accruallarni OLMAYDI (unpaid = salaryPaymentId IS NULL) → double-pay YO'Q.
 *
 * TEGMAYDI: SalaryPayment.status / amount / paidAt, ustoz BALANSI, ledger.
 *   (Bularni PAID qilish balans+ledgerni o'zgartiradi — buni rework'da tizim oqimi
 *    orqali to'g'ri qilamiz, raw SQL bilan emas.)
 *
 * Qolgan bog'lanmagan (haqiqatan to'lanmagan) accruallar → tegilmaydi → iyulga o'tadi.
 */
import { PrismaClient } from '@prisma/client';
import { som, dbEnvLabel, printHeader, section, run } from './lib/check-cli';

const COMPANY_ID = 1001;
const EXECUTE = process.argv.includes('--execute');
const JUNE = { gte: new Date(Date.UTC(2026, 5, 1)), lt: new Date(Date.UTC(2026, 6, 1)) };

// Jadval (rasm): har ustoz GROSS olgani ("O'quvchilar to'lagani")
const PAID_GROSS: Record<number, number> = {
  10010: 25_200_500, 10008: 7_916_825, 10007: 6_900_138, 10006: 6_466_796,
  10003: 6_400_128, 10005: 6_366_794, 10014: 3_519_912, 10002: 2_266_712,
  10473: 1_599_960, 10505: 66_665,
};

async function main(prisma: PrismaClient) {
  printHeader(`IYUN RECONCILIATION — ${EXECUTE ? 'EXECUTE (YOZADI!)' : 'DRY-RUN'} — faqat accrual bog'lash`);
  console.log(`  Baza: ${dbEnvLabel()}`);

  const accruals = await prisma.salaryAccrual.findMany({
    where: { companyId: COMPANY_ID, reversedAt: null, lessonDate: { gte: JUNE.gte, lt: JUNE.lt } },
    select: { id: true, userId: true, amount: true, salaryPaymentId: true },
    orderBy: { createdAt: 'asc' },
  });
  const payments = await prisma.salaryPayment.findMany({
    where: { companyId: COMPANY_ID, periodEnd: { gte: new Date('2026-06-20'), lt: new Date('2026-07-10') } },
    select: { id: true, userId: true, amount: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(accruals.map((a) => a.userId))] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameMap = new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || `#${u.id}`]));

  const teacherIds = [...new Set(accruals.map((a) => a.userId))];
  const linkOps: { userId: number; name: string; primaryId: string; ids: string[]; sum: number }[] = [];
  const noPayment: number[] = [];
  let toJulyTotal = 0;

  for (const uid of teacherIds) {
    const acc = accruals.filter((a) => a.userId === uid);
    const linked = acc.filter((a) => a.salaryPaymentId != null).reduce((s, a) => s + a.amount, 0);
    const unlinked = acc.filter((a) => a.salaryPaymentId == null); // oldest-first
    let need = Math.max(0, (PAID_GROSS[uid] ?? 0) - linked);
    const ids: string[] = [];
    for (const a of unlinked) { if (need >= a.amount) { ids.push(a.id); need -= a.amount; } }
    const sum = unlinked.filter((a) => ids.includes(a.id)).reduce((s, a) => s + a.amount, 0);
    toJulyTotal += unlinked.filter((a) => !ids.includes(a.id)).reduce((s, a) => s + a.amount, 0);

    if (ids.length === 0) continue; // bog'lash shart emas (masalan Muzzammila)
    const teacherPayments = payments.filter((p) => p.userId === uid).sort((a, b) => b.amount - a.amount);
    if (!teacherPayments.length) { noPayment.push(uid); continue; }
    linkOps.push({ userId: uid, name: nameMap.get(uid) ?? `#${uid}`, primaryId: teacherPayments[0].id, ids, sum });
  }

  section('Bog\'lanadigan accruallar (to\'langan → linked)');
  for (const o of linkOps) {
    console.log(`  ${o.name.padEnd(24)} ${String(o.ids.length).padStart(3)} accrual  ${som(o.sum).padStart(12)}  → payment ${o.primaryId.slice(0, 8)}`);
  }
  const totLink = linkOps.reduce((s, o) => s + o.sum, 0);
  section('Jami');
  console.log(`  Bog'lanadi (double-pay bloki) : ${som(totLink)}  (${linkOps.reduce((s, o) => s + o.ids.length, 0)} accrual)`);
  console.log(`  Iyulga qoladi (tegilmaydi)    : ${som(toJulyTotal)}`);
  console.log(`  Balans / ledger / status      : TEGILMAYDI`);
  if (noPayment.length) {
    console.log(`\n  ⚠️ TO'XTASH: iyun payment yo'q: ${noPayment.join(', ')} — qo'lda hal qilish kerak.`);
    return;
  }

  if (!EXECUTE) {
    console.log('\n  DRY-RUN — hech narsa yozilmadi. Bajarish: --execute\n');
    return;
  }

  console.log('\n  ⚙️ EXECUTE — accruallar bog\'lanmoqda (bitta tx)...');
  await prisma.$transaction(async (tx) => {
    for (const o of linkOps) {
      await tx.salaryAccrual.updateMany({ where: { id: { in: o.ids } }, data: { salaryPaymentId: o.primaryId } });
    }
  }, { timeout: 30000 });
  console.log('  ✅ Bajarildi — accruallar bog\'landi.\n');
}

run(main);
