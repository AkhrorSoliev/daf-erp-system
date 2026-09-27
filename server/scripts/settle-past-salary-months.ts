/**
 * settle-past-salary-months — close payroll months that were paid OUTSIDE the
 * system, by the rules the CEO set on 27.09.2026, when the exact cash/card
 * split of those months was no longer known:
 *
 *   - a month's payroll counts as paid on the `--pay-day` (default 10th) of the
 *     FOLLOWING month;
 *   - a teacher's payout: half cash, half card (the odd so'm goes to cash);
 *   - staff — a global FIXED_MONTHLY rate and no Teacher role: all cash;
 *   - a month paid out before the payee branch's cash journal began gets NO
 *     cash movement: that money never passed through a drawer the system knows.
 *
 * Writes go through `SalarySettleAllocatedService`, i.e. the checks and the
 * writer of the «Oylik berilganini tasdiqlash» button.
 *
 * Default = DRY RUN over a READ-ONLY connection — nothing can be written.
 *   DATABASE_URL=… npx ts-node --transpile-only scripts/settle-past-salary-months.ts \
 *     --months=2026-05,2026-06,2026-07,2026-08 --as=<approving CEO user id>
 * `--apply` writes, month by month; each month is re-read and checked before
 * the next one starts. DATABASE_URL is required (no .env fallback), so the
 * target database is always the one named on the command line.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { CashMovementsService } from '../src/cash-accounts/cash-movements.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import { TransactionsReadService } from '../src/transactions/transactions-read.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import {
  AllocatedPaymentPlan,
  SalarySettleAllocatedService,
} from '../src/salary/salary-settle-allocated.service';
import {
  loadSettleCandidates,
  SettleRow,
} from '../src/salary/salary-settle-core';
import { parseTashkentDateStart } from '../src/salary/shared/resolve-current-period';
import {
  payDayAfter,
  planPastMonthPayment,
} from './lib/past-salary-month-plan';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const APPLY = args.includes('--apply');
const MONTHS = (arg('months') ?? '').split(',').filter(Boolean);
const AS = Number(arg('as'));
const PAY_DAY = Number(arg('pay-day') ?? 10);
const NOTE =
  'Naqd/karta taqsimoti taxminiy: ustozga 50/50, xodimga naqd (CEO qarori, 27.09.2026)';

const fmt = (n: number) => n.toLocaleString('ru-RU');

interface BranchAccounts {
  cash: { id: string; name: string; balance: number };
  bank: { id: string; name: string; balance: number };
  /** Earliest movement on ANY of the branch's accounts, closed ones included. */
  journalStart: Date | null;
}

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

async function branchAccounts(
  prisma: PrismaService,
  companyId: number,
  branchId: number,
): Promise<BranchAccounts> {
  const accounts = await prisma.cashAccount.findMany({
    where: { companyId, branchId, isActive: true, deletedAt: null },
    select: { id: true, name: true, type: true, balance: true },
  });
  const cash = accounts.filter((a) => a.type === 'CASH');
  const bank = accounts.filter((a) => a.type === 'BANK');
  if (cash.length !== 1 || bank.length !== 1) {
    throw new Error(
      `Branch #${branchId}: expected exactly one active CASH and one BANK account, found ${cash.length} / ${bank.length}`,
    );
  }
  const first = await prisma.cashMovement.aggregate({
    where: { cashAccount: { companyId, branchId } },
    _min: { createdAt: true },
  });
  return { cash: cash[0], bank: bank[0], journalStart: first._min.createdAt };
}

async function runMonth(
  prisma: PrismaService,
  settle: SalarySettleAllocatedService,
  companyId: number,
  month: string,
  running: Map<string, number>,
): Promise<void> {
  const paidAt = payDayAfter(month, PAY_DAY);
  const paidAtInstant = parseTashkentDateStart(paidAt);
  const { scope, rows } = await loadSettleCandidates(
    prisma,
    month,
    companyId,
    AS,
  );
  if (scope.month !== month) {
    throw new Error(`${month}: the report floors it to ${scope.month}`);
  }
  if (rows.length === 0) {
    console.log(`\n=== ${month}: nothing unpaid — skipped ===`);
    return;
  }

  // ─── Who is staff ────────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
    select: {
      id: true,
      salaryConfigs: {
        where: { salaryType: 'FIXED_MONTHLY', groupId: null },
        select: { id: true },
      },
      roles: {
        where: { role: { name: 'Teacher' } },
        select: { roleId: true },
      },
    },
  });
  const isStaff = new Map(
    users.map((u) => [
      u.id,
      u.salaryConfigs.length > 0 && u.roles.length === 0,
    ]),
  );
  const counts = await prisma.salaryPayment.findMany({
    where: { id: { in: rows.map((r) => r.paymentId) } },
    select: { id: true, _count: { select: { accruals: true } } },
  });
  const accrualsOf = new Map(counts.map((c) => [c.id, c._count.accruals]));
  for (const r of rows) {
    if (isStaff.get(r.userId) && (accrualsOf.get(r.paymentId) ?? 0) > 0) {
      throw new Error(
        `${month}: ${r.fullName} looks like staff but the payment has accruals — refusing to guess`,
      );
    }
  }

  // ─── Accounts and cash-journal start per branch ──────────────────────────
  const noBranch = rows.filter((r) => r.branchId == null);
  if (noBranch.length) {
    throw new Error(
      `${month}: payee without a branch: ${noBranch.map((r) => r.fullName).join(', ')}`,
    );
  }
  const branches = new Map<number, BranchAccounts>();
  for (const b of new Set(rows.map((r) => r.branchId as number))) {
    branches.set(b, await branchAccounts(prisma, companyId, b));
  }

  // ─── The plan ────────────────────────────────────────────────────────────
  const planOf = (r: SettleRow): AllocatedPaymentPlan => {
    const acc = branches.get(r.branchId as number) as BranchAccounts;
    return planPastMonthPayment(
      {
        paymentId: r.paymentId,
        amount: r.amount,
        staff: isStaff.get(r.userId) === true,
      },
      {
        cashAccountId: acc.cash.id,
        bankAccountId: acc.bank.id,
        journalStart: acc.journalStart,
      },
      paidAtInstant,
    );
  };
  const plan = rows.map(planOf);

  const res = await settle.settle(
    { month, paidAt, note: NOTE, payments: plan },
    companyId,
    AS,
    { dryRun: !APPLY },
  );

  // ─── Report ──────────────────────────────────────────────────────────────
  console.log(
    `\n=== ${month} — paid ${paidAt} — ${rows.length} rows — ${fmt(res.total)} ===`,
  );
  const sliceSum = (p: AllocatedPaymentPlan, id: string) =>
    (p.cashSlices ?? [])
      .filter((s) => s.cashAccountId === id)
      .reduce((s, x) => s + x.amount, 0);
  for (const r of rows) {
    const p = plan.find(
      (x) => x.paymentId === r.paymentId,
    ) as AllocatedPaymentPlan;
    const acc = branches.get(r.branchId as number) as BranchAccounts;
    const who = isStaff.get(r.userId) ? 'xodim' : 'ustoz';
    const tail = p.predatesCashJournal
      ? 'kassa jurnalidan oldin — harakat yozilmaydi'
      : `naqd ${fmt(sliceSum(p, acc.cash.id)).padStart(11)} · karta ${fmt(sliceSum(p, acc.bank.id)).padStart(11)}`;
    console.log(
      `  ${r.fullName.padEnd(28)} ${who.padEnd(5)} ${fmt(r.amount).padStart(11)}  ${tail}`,
    );
  }
  for (const [b, acc] of branches) {
    for (const a of [acc.cash, acc.bank]) {
      const before = running.get(a.id) ?? a.balance;
      const out =
        res.perAccount.find((x) => x.cashAccountId === a.id)?.amount ?? 0;
      running.set(a.id, before - out);
      console.log(
        `  [branch #${b}] ${a.name}: ${fmt(before)} → ${fmt(before - out)} (−${fmt(out)})`,
      );
    }
  }
  if (res.predatesCashJournalTotal) {
    console.log(
      `  paid before the cash journal (no movement): ${fmt(res.predatesCashJournalTotal)}`,
    );
  }

  if (!APPLY) return;

  // ─── Verify what was written before the next month starts ────────────────
  if (res.count !== rows.length) {
    throw new Error(
      `${month}: wrote ${res.count} of ${rows.length} rows — another request settled some; stopping`,
    );
  }
  const left = await loadSettleCandidates(prisma, month, companyId, AS);
  if (left.rows.length) {
    throw new Error(
      `${month}: ${left.rows.length} rows still unpaid after apply`,
    );
  }
  const ledger = await prisma.transaction.findMany({
    where: {
      salaryPaymentId: { in: res.paymentIds },
      type: 'SALARY_PAYMENT',
      reversedAt: null,
      reversedTransactionId: null,
    },
    select: { id: true },
  });
  if (ledger.length !== res.paymentIds.length) {
    throw new Error(
      `${month}: ${ledger.length} ledger rows for ${res.paymentIds.length} payments`,
    );
  }
  const moved = await prisma.cashMovement.groupBy({
    by: ['cashAccountId'],
    where: { transactionId: { in: ledger.map((l) => l.id) }, reversedAt: null },
    _sum: { amount: true },
  });
  for (const m of moved) {
    const planned =
      res.perAccount.find((a) => a.cashAccountId === m.cashAccountId)?.amount ??
      0;
    if ((m._sum.amount ?? 0) !== -planned) {
      throw new Error(
        `${month}: account ${m.cashAccountId} moved ${m._sum.amount}, planned −${planned}`,
      );
    }
  }
  for (const a of res.perAccount) {
    if (
      a.amount > 0 &&
      !moved.some((m) => m.cashAccountId === a.cashAccountId)
    ) {
      throw new Error(
        `${month}: planned account ${a.cashAccountId} got no movement`,
      );
    }
  }
  console.log(
    `  verified: ${ledger.length} ledger rows, cash movements equal the plan`,
  );
}

async function main() {
  const monthOk = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
  if (
    MONTHS.length === 0 ||
    !MONTHS.every(monthOk) ||
    !Number.isInteger(AS) ||
    AS <= 0 ||
    !Number.isInteger(PAY_DAY) ||
    PAY_DAY < 1 ||
    PAY_DAY > 28
  ) {
    throw new Error(
      'Usage: --months=YYYY-MM[,YYYY-MM…] --as=<userId> [--pay-day=10] [--apply]',
    );
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!APPLY) process.env.DATABASE_URL = readOnlyUrl(url);

  const prisma = new PrismaService();
  const cash = new CashMovementsService(prisma);
  const transactions = new TransactionsService(
    new TransactionsWriteService(prisma, cash),
    new TransactionsReadService(prisma),
  );
  const settle = new SalarySettleAllocatedService(prisma, transactions);

  try {
    console.log(`DB host: ${new URL(url).host}`);
    if (!APPLY) {
      const [ro] = await prisma.$queryRaw<
        { default_transaction_read_only: string }[]
      >`SHOW default_transaction_read_only`;
      if (ro?.default_transaction_read_only !== 'on') {
        throw new Error('Read-only connection was not established — stopping');
      }
    }
    console.log(
      `Mode: ${APPLY ? 'APPLY' : 'DRY RUN — read-only connection, nothing is written'}`,
    );

    const actor = await prisma.user.findUnique({
      where: { id: AS },
      select: {
        companyId: true,
        firstName: true,
        lastName: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!actor) throw new Error(`User #${AS} not found`);
    if (!actor.roles.some((r) => r.role.name === 'CEO')) {
      throw new Error(`User #${AS} is not a CEO`);
    }
    console.log(`As: ${actor.firstName} ${actor.lastName}`);

    const running = new Map<string, number>();
    for (const month of MONTHS) {
      await runMonth(prisma, settle, actor.companyId, month, running);
    }
    console.log(APPLY ? '\nAPPLIED.' : '\nDRY RUN finished — nothing written.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`\nSTOPPED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
