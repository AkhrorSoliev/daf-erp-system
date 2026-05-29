import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const id = 10260;

const fmt = (n: number) => n.toLocaleString('ru-RU') + " so'm";
const day = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : '—';
const dt = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 16).replace('T', ' ') : '—';

async function main() {
  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      balance: true,
      createdAt: true,
      deletedAt: true,
    },
  });

  if (!student) {
    console.log(`Student id=${id} topilmadi.`);
    return;
  }

  console.log('=== TALABA ===');
  console.log(
    `id=${student.id} | ${student.firstName} ${student.lastName} | tel=${student.phone ?? '—'} | status=${student.status} | balans=${fmt(student.balance)} | yaratilgan=${day(student.createdAt)}${student.deletedAt ? ' | DELETED' : ''}`,
  );

  // ===== TO'LOVLAR =====
  const payments = await prisma.payment.findMany({
    where: { studentId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      amount: true,
      method: true,
      status: true,
      source: true,
      createdAt: true,
      contractId: true,
      branchId: true,
      externalId: true,
      providerFee: true,
      note: true,
    },
  });

  console.log(`\n=== TO'LOVLAR (${payments.length} ta) ===`);
  let sumCompleted = 0;
  let sumReversed = 0;
  let sumPending = 0;
  for (const p of payments) {
    const flag =
      p.status === 'COMPLETED'
        ? 'OK   '
        : p.status === 'REVERSED'
          ? 'BEKOR'
          : p.status.padEnd(5);
    console.log(
      `  #${p.id}  ${dt(p.createdAt)}  ${fmt(p.amount).padStart(20)}  ${p.method.padEnd(8)}  ${flag}  src=${p.source.padEnd(15)} ext=${p.externalId ?? '—'} fee=${p.providerFee ?? 0} note=${p.note ?? '—'}`,
    );
    if (p.status === 'COMPLETED') sumCompleted += p.amount;
    if (p.status === 'REVERSED') sumReversed += p.amount;
    if (p.status === 'PENDING') sumPending += p.amount;
  }
  console.log(`  -------`);
  console.log(`  Jami COMPLETED: ${fmt(sumCompleted)}`);
  if (sumReversed > 0) console.log(`  Jami REVERSED:  ${fmt(sumReversed)}`);
  if (sumPending > 0) console.log(`  Jami PENDING:   ${fmt(sumPending)}`);

  // ===== KONTRAKTLAR =====
  const contracts = await prisma.contract.findMany({
    where: { studentId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      contractNumber: true,
      totalAmount: true,
      paidAmount: true,
      status: true,
      createdAt: true,
      courseId: true,
    },
  });
  console.log(`\n=== KONTRAKTLAR (${contracts.length} ta) ===`);
  for (const c of contracts) {
    console.log(
      `  ${c.contractNumber}  ${day(c.createdAt)}  jami=${fmt(c.totalAmount)}  to'langan=${fmt(c.paidAmount)}  status=${c.status}`,
    );
  }

  // ===== ENROLLMENTLAR =====
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: id },
    orderBy: { createdAt: 'asc' },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          course: { select: { name: true, price: true, lessonPaymentCount: true } },
        },
      },
    },
  });

  console.log(`\n=== ENROLLMENTLAR (${enrollments.length} ta) ===`);
  for (const e of enrollments) {
    const g = e.group;
    const perLesson = Math.round((g.course.price || 0) / (g.course.lessonPaymentCount || 1));
    console.log(
      `  enrollment=${e.id.slice(0, 8)}  guruh=${g.name}  status=${e.status}  prepaid=${e.prepaidLessonsRemaining}  kurs=${g.course.name} (${fmt(g.course.price)} / ${g.course.lessonPaymentCount} dars ≈ ${fmt(perLesson)}/dars)  guruh-holati=${g.status}  ${day(g.startDate)}..${day(g.endDate)}`,
    );
  }

  // ===== TO'LIQ LEDGER =====
  console.log(`\n=== TO'LIQ LEDGER (Transaction) ===`);
  const ledger = await prisma.transaction.findMany({
    where: { studentId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      type: true,
      amount: true,
      balanceBefore: true,
      balanceAfter: true,
      reversedAt: true,
      reversedTransactionId: true,
      createdAt: true,
      description: true,
    },
  });
  for (const t of ledger) {
    const rev = t.reversedAt ? ' [REVERSED]' : '';
    const ref = t.reversedTransactionId ? ` ref→#${t.reversedTransactionId}` : '';
    console.log(
      `  #${t.id}  ${dt(t.createdAt)}  ${t.type.padEnd(22)}  ${t.amount.toString().padStart(12)}  ${t.balanceBefore.toString().padStart(10)} → ${t.balanceAfter.toString().padStart(10)}${rev}${ref}  ${t.description ?? ''}`,
    );
  }

  // ===== GATEWAY tarixi =====
  const paymeTxns = await prisma.paymeTransaction.findMany({
    where: { studentId: id },
    orderBy: { createTime: 'asc' },
    select: {
      paymeId: true,
      amount: true,
      amountInSom: true,
      state: true,
      createTime: true,
      performTime: true,
      cancelTime: true,
    },
  });
  const bigintToDt = (b: bigint | null | undefined) =>
    b ? dt(new Date(Number(b))) : '—';
  if (paymeTxns.length > 0) {
    console.log(`\n=== PAYME TRANSACTIONS (${paymeTxns.length}) ===`);
    for (const t of paymeTxns) {
      console.log(
        `  paymeId=${t.paymeId}  state=${t.state}  som=${fmt(t.amountInSom)}  created=${bigintToDt(t.createTime)}  perf=${bigintToDt(t.performTime)}  canc=${bigintToDt(t.cancelTime)}`,
      );
    }
  }

  const clickTxns = await (prisma as any).clickTransaction.findMany({
    where: { studentId: id },
    orderBy: { createdAt: 'asc' },
  }).catch(() => [] as any[]);
  if (clickTxns.length > 0) {
    console.log(`\n=== CLICK TRANSACTIONS (${clickTxns.length}) ===`);
    for (const t of clickTxns) {
      console.log(
        `  clickTransId=${t.clickTransId}  status=${t.status}  som=${fmt(t.amountInSom ?? 0)}  created=${dt(t.createdAt)}`,
      );
    }
  }

  // ===== REFUNDS =====
  const refunds = await prisma.refund.findMany({
    where: { studentId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      requestedAmount: true,
      approvedAmount: true,
      status: true,
      createdAt: true,
      processedAt: true,
      reason: true,
    },
  });
  if (refunds.length > 0) {
    console.log(`\n=== REFUNDS (${refunds.length}) ===`);
    for (const r of refunds) {
      console.log(
        `  #${r.id}  ${day(r.createdAt)}  so'ralgan=${fmt(r.requestedAmount)}  tasdiqlangan=${r.approvedAmount ? fmt(r.approvedAmount) : '—'}  status=${r.status}  proc=${day(r.processedAt)}  sabab=${r.reason ?? '—'}`,
      );
    }
  }

  // ===== XULOSA =====
  console.log(`\n=== XULOSA ===`);
  const lessonDeductions = ledger
    .filter((t) => t.type === 'LESSON_DEDUCTION' && !t.reversedAt)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const withdrawals = ledger
    .filter((t) => t.type === 'BALANCE_WITHDRAWAL' && !t.reversedAt)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  console.log(`  Jami COMPLETED to'lovlar:        ${fmt(sumCompleted)}`);
  console.log(`  Jami LESSON_DEDUCTION (aktiv):   ${fmt(lessonDeductions)}`);
  console.log(`  Jami BALANCE_WITHDRAWAL (aktiv): ${fmt(withdrawals)}`);
  console.log(`  Hozirgi balans:                  ${fmt(student.balance)}`);
}

main()
  .catch((e) => {
    console.error('ERROR:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
