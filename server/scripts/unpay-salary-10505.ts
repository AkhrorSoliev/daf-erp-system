/**
 * unpay-salary-10505 — revert an accidentally-PAID salary back to APPROVED.
 *
 * Teacher #10505 Muzzammila Sobirova, period 31.05–30.06.2026, was paid by
 * mistake. This undoes the payment using the REAL production code path
 * (TransactionsWriteService.reverseTransaction — restores teacher balance,
 * reverses the cash outflow, writes an append-only reversal) and flips the
 * SalaryPayment PAID → APPROVED (paidAt/paidById cleared). Accruals stay linked
 * (0 settled advances, nothing else to touch).
 *
 * Default = DRY RUN (prints the plan, changes nothing). Pass --apply to execute.
 *   railway run npx ts-node --transpile-only scripts/unpay-salary-10505.ts
 *   railway run npx ts-node --transpile-only scripts/unpay-salary-10505.ts --apply
 */
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashMovementsService } from '../src/cash-accounts/cash-movements.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';

const PAYMENT_ID = 'a5c0d8ee-7515-461b-a515-6d1ea2009c5b';
const USER_ID = 10505;
const REASON =
  "Adashib to'langan oylik bekor qilindi (31.05-30.06.2026) - to'lanmagan holatga qaytarildi";

const APPLY = process.argv.includes('--apply');
const f = (n: number) => n.toLocaleString('ru-RU');

async function main() {
  const prisma = new PrismaService();
  const cash = new CashMovementsService(prisma);
  const txw = new TransactionsWriteService(prisma, cash);

  // ---- Load + guard ----
  const payment = await prisma.salaryPayment.findUnique({
    where: { id: PAYMENT_ID },
    select: {
      id: true,
      userId: true,
      status: true,
      amount: true,
      paidAt: true,
      paidById: true,
      companyId: true,
      _count: { select: { accruals: true, settledExpenses: true } },
    },
  });
  if (!payment) throw new Error(`SalaryPayment ${PAYMENT_ID} topilmadi`);
  if (payment.userId !== USER_ID)
    throw new Error(`Payment userId ${payment.userId} !== ${USER_ID}`);
  if (payment.status !== 'PAID')
    throw new Error(`Payment status ${payment.status} !== PAID — to'xtatildi`);
  if (payment._count.settledExpenses !== 0)
    throw new Error(
      `Kutilmagan: ${payment._count.settledExpenses} settled advance bor — qo'lda tekshir`,
    );

  // The single active (non-reversed) SALARY_PAYMENT ledger row for this payment.
  const activeTxns = await prisma.transaction.findMany({
    where: {
      salaryPaymentId: PAYMENT_ID,
      type: 'SALARY_PAYMENT',
      reversedAt: null,
      reversedTransactionId: null,
    },
    select: { id: true, amount: true },
  });
  if (activeTxns.length !== 1)
    throw new Error(
      `Kutilmagan: ${activeTxns.length} ta aktiv SALARY_PAYMENT txn (1 kutilgan)`,
    );
  const txn = activeTxns[0];

  const cm = await prisma.cashMovement.findMany({
    where: { transactionId: txn.id, reversedAt: null },
    select: { id: true, amount: true, cashAccountId: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    select: { balance: true },
  });
  const acctId = cm[0]?.cashAccountId;
  const acct = acctId
    ? await prisma.cashAccount.findUnique({
        where: { id: acctId },
        select: { balance: true, name: true },
      })
    : null;

  console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY RUN'} — unpay #${USER_ID} ===`);
  console.log(`Payment  : ${payment.id}`);
  console.log(
    `  status : ${payment.status} → APPROVED   amount=${f(payment.amount)}   accruals=${payment._count.accruals} (o'zgarmaydi)`,
  );
  console.log(`  paidAt/paidById : tozalanadi (${String(payment.paidAt)}/${payment.paidById})`);
  console.log(`Ledger   : reverse SALARY_PAYMENT txn ${txn.id} (amount=${f(txn.amount)})`);
  console.log(
    `  teacher balance : ${f(user?.balance ?? 0)} → ${f((user?.balance ?? 0) + payment.amount)}`,
  );
  for (const m of cm)
    console.log(
      `  cash reverse : movement ${m.id} (amount=${f(m.amount)}) on "${acct?.name}" ${f(acct?.balance ?? 0)} → ${f((acct?.balance ?? 0) + payment.amount)}`,
    );

  if (!APPLY) {
    console.log('\nDRY RUN — hech narsa o\'zgartirilmadi. Bajarish uchun: --apply\n');
    await prisma.$disconnect();
    return;
  }

  // ---- Apply (single Serializable tx) ----
  await prisma.$transaction(
    async (tx) => {
      await txw.reverseTransaction(txn.id, { reason: REASON }, tx);
      await tx.salaryPayment.update({
        where: { id: PAYMENT_ID },
        data: { status: 'APPROVED', paidAt: null, paidById: null },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 15000,
      timeout: 20000,
    },
  );

  // ---- Verify ----
  const after = await prisma.salaryPayment.findUnique({
    where: { id: PAYMENT_ID },
    select: { status: true, paidAt: true, paidById: true },
  });
  const uAfter = await prisma.user.findUnique({
    where: { id: USER_ID },
    select: { balance: true },
  });
  const aAfter = acctId
    ? await prisma.cashAccount.findUnique({
        where: { id: acctId },
        select: { balance: true },
      })
    : null;
  const txAfter = await prisma.transaction.findUnique({
    where: { id: txn.id },
    select: { reversedAt: true },
  });

  console.log('\n=== NATIJA ===');
  console.log(`Payment status : ${after?.status}  paidAt=${String(after?.paidAt)}  paidById=${after?.paidById}`);
  console.log(`Teacher balance: ${f(uAfter?.balance ?? 0)}`);
  console.log(`Cash account   : ${f(aAfter?.balance ?? 0)}`);
  console.log(`Orig txn reversedAt: ${String(txAfter?.reversedAt)}`);
  console.log('\n✅ Bajarildi.\n');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Xatolik:', e.message ?? e);
  process.exit(1);
});
