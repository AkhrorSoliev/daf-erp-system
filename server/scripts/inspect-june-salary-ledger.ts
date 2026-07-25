/**
 * IYUN SALARY_PAYMENT LEDGER — INSPECT — READ-ONLY.
 * Reconciliation dry-run 2 ta SALARY_PAYMENT ledger tranzaksiyasini topdi.
 * Ular nima ekanini va qaysi payment'ga tegishli ekanini ko'ramiz.
 */
import { PrismaClient } from '@prisma/client';
import { som, day, dt, dbEnvLabel, printHeader, section, run } from './lib/check-cli';

const COMPANY_ID = 1001;

async function main(prisma: PrismaClient) {
  printHeader('IYUN SALARY_PAYMENT LEDGER — INSPECT');
  console.log(`  Baza: ${dbEnvLabel()}`);

  const payments = await prisma.salaryPayment.findMany({
    where: { companyId: COMPANY_ID, periodEnd: { gte: new Date('2026-06-20'), lt: new Date('2026-07-10') } },
    select: { id: true, userId: true, amount: true, status: true, paidAt: true },
  });

  const txs = await prisma.transaction.findMany({
    where: { companyId: COMPANY_ID, type: 'SALARY_PAYMENT', salaryPaymentId: { in: payments.map((p) => p.id) } },
    select: {
      id: true, amount: true, teacherId: true, salaryPaymentId: true,
      description: true, metadata: true, reversedAt: true, createdAt: true,
      balanceBefore: true, balanceAfter: true,
    },
  });

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(txs.map((t) => t.teacherId).filter((x): x is number => !!x))] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameMap = new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || `#${u.id}`]));
  const pById = new Map(payments.map((p) => [p.id, p]));

  section(`Topilgan SALARY_PAYMENT tranzaksiyalari: ${txs.length}`);
  for (const t of txs) {
    const p = t.salaryPaymentId ? pById.get(t.salaryPaymentId) : null;
    console.log('  ─────────────────────────────────────────');
    console.log(`  tx.id        : ${t.id}`);
    console.log(`  ustoz        : ${t.teacherId ? nameMap.get(t.teacherId) ?? t.teacherId : '—'} (#${t.teacherId})`);
    console.log(`  amount       : ${som(t.amount)}   balance ${som(t.balanceBefore)} → ${som(t.balanceAfter)}`);
    console.log(`  createdAt    : ${dt(t.createdAt)}`);
    console.log(`  reversedAt   : ${t.reversedAt ? dt(t.reversedAt) : '—'}`);
    console.log(`  description  : ${t.description ?? '—'}`);
    console.log(`  metadata     : ${JSON.stringify(t.metadata)}`);
    console.log(`  salaryPayment: ${t.salaryPaymentId}`);
    if (p) console.log(`     → payment: userId=${p.userId} amount=${som(p.amount)} status=${p.status} paidAt=${p.paidAt ? day(p.paidAt) : '—'}`);
    else console.log(`     → payment TOPILMADI (iyun to'plamida yo'q)`);
  }

  section('Shu payment\'lar holati');
  for (const t of txs) {
    if (!t.salaryPaymentId) continue;
    const p = pById.get(t.salaryPaymentId);
    if (p) console.log(`  ${nameMap.get(p.userId) ?? p.userId}: status=${p.status}, paidAt=${p.paidAt ? day(p.paidAt) : '—'}, amount=${som(p.amount)}`);
  }
  console.log('');
}

run(main);
