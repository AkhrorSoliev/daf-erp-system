/**
 * Unwind the phantom credits the old refund flow left behind.
 *
 * Until 2026-08-18 `quickRefund` credited `lesson deductions − PRESENT/LATE
 * attendance` back to the balance and called it "foydalanilmagan darslar".
 * That difference is always the ABSENT lessons (billable here) plus lessons
 * still reserved for future dates, and the reserved ones stayed covered
 * because `prepaidLessonsRemaining` was never decremented — so one payment
 * was counted twice. See docs/superpowers/specs/2026-08-18-refund-system-rebuild-design.md.
 *
 * This reverses those ADJUSTMENT rows. It deliberately does NOT touch
 * `prepaidLessonsRemaining`: the old flow never decremented it, so there is
 * nothing to give back — the lessons are still there, which is the whole
 * defect. Refunds written by the NEW flow are skipped: their release is
 * legitimate (it cancelled lessons), and they are identified by the
 * `metadata.refundId` tag the new code writes.
 *
 * Instantiates the real service classes directly (no NestFactory → no crons,
 * no telegram polling) so the reversal is byte-identical to the one the API
 * would write.
 *
 * Usage:
 *   railway run npx ts-node --transpile-only scripts/fix-refund-phantom-credit.ts
 *   railway run npx ts-node --transpile-only scripts/fix-refund-phantom-credit.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { som, printHeader, section, run } from './lib/check-cli';
import { PrismaService } from '../src/prisma/prisma.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import { CashMovementsService } from '../src/cash-accounts/cash-movements.service';

const COMPANY_ID = 1001;
const LEGACY_DESCRIPTION = 'Refund: foydalanilmagan darslar balansga qaytarildi';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const PERFORMED_BY = (() => {
  const a = argv.find((x) => x.startsWith('--by='));
  return a ? Number(a.split('=')[1]) : undefined;
})();

async function main(prismaClient: PrismaClient) {
  const prisma = prismaClient as unknown as PrismaService;

  printHeader(
    `Refund fantom kredit — ${APPLY ? 'QO\'LLASH' : "KO'RIB CHIQISH (dry-run)"}`,
  );

  const refunds = await prismaClient.refund.findMany({
    where: { companyId: COMPANY_ID, status: 'COMPLETED' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      studentId: true,
      approvedAmount: true,
      createdAt: true,
      student: { select: { firstName: true, lastName: true, balance: true } },
    },
  });

  section(`COMPLETED refundlar: ${refunds.length} ta`);

  const candidates: {
    txId: string;
    studentId: number;
    name: string;
    amount: number;
    balance: number;
    refundId: string;
  }[] = [];

  for (const r of refunds) {
    // The new flow tags its release; anything tagged is legitimate.
    const tagged = await prismaClient.transaction.findFirst({
      where: {
        type: 'ADJUSTMENT',
        metadata: { path: ['refundId'], equals: r.id },
      },
      select: { id: true },
    });
    if (tagged) {
      console.log(
        `  #${r.studentId} ${r.student.firstName} ${r.student.lastName} — yangi oqim, tegilmaydi`,
      );
      continue;
    }

    // Legacy rows carry no tag, so they are matched by their fixed wording
    // within a minute of the refund. Both halves of a reversal share the
    // description, so `reversedAt: null` here means "not yet undone".
    const legacy = await prismaClient.transaction.findFirst({
      where: {
        studentId: r.studentId,
        type: 'ADJUSTMENT',
        description: LEGACY_DESCRIPTION,
        reversedTransactionId: null,
        reversedAt: null,
        createdAt: {
          gte: new Date(r.createdAt.getTime() - 60_000),
          lte: new Date(r.createdAt.getTime() + 60_000),
        },
      },
      select: { id: true, amount: true },
    });

    if (!legacy) {
      console.log(
        `  #${r.studentId} ${r.student.firstName} ${r.student.lastName} — fantom kredit yo'q (yoki allaqachon bekor qilingan)`,
      );
      continue;
    }

    candidates.push({
      txId: legacy.id,
      studentId: r.studentId,
      name: `${r.student.firstName} ${r.student.lastName}`,
      amount: legacy.amount,
      balance: r.student.balance,
      refundId: r.id,
    });
  }

  section(`Bekor qilinadigan yozuvlar: ${candidates.length} ta`);
  if (!candidates.length) {
    console.log('  Tuzatiladigan narsa yo\'q.');
    return;
  }

  for (const c of candidates) {
    console.log(
      `  #${c.studentId} ${c.name}\n` +
        `     fantom kredit : ${som(c.amount)} so'm  (tx ${c.txId.slice(0, 8)})\n` +
        `     hozirgi balans: ${som(c.balance)} so'm\n` +
        `     keyin bo'ladi : ${som(c.balance - c.amount)} so'm`,
    );
  }

  if (!APPLY) {
    console.log(
      "\n  Dry-run. Qo'llash uchun: --apply (va kim qilayotganini --by=<userId> bilan bering)",
    );
    return;
  }

  const writer = new TransactionsWriteService(
    prisma,
    new CashMovementsService(prisma),
  );

  section('Qo\'llanmoqda');
  for (const c of candidates) {
    try {
      await writer.reverseTransaction(c.txId, {
        performedById: PERFORMED_BY,
        reason:
          "Refund fantom krediti bekor qilindi (foydalanilmagan darslar noto'g'ri hisoblangan edi)",
      });
      const after = await prismaClient.student.findUnique({
        where: { id: c.studentId },
        select: { balance: true },
      });
      console.log(
        `  ✓ #${c.studentId} ${c.name} — ${som(c.amount)} so'm bekor qilindi, balans: ${som(after?.balance ?? 0)} so'm`,
      );
    } catch (e) {
      console.error(`  ✗ #${c.studentId} ${c.name} — ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }
}

run(main);
