/**
 * audit-expense-cash-branch — READ-ONLY. Batch 3 (xarajat + kassada filial
 * majburiy) oldidan bazaning aniq holatini ko'rsatadi.
 *
 * Usage: railway run npx ts-node scripts/audit-expense-cash-branch.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL yo'q");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const som = (n: number) => n.toLocaleString('ru-RU').replace(/ /g, ' ');

async function main() {
  console.log(
    `DB: ${new URL(connectionString!).host} | RAILWAY: ${process.env.RAILWAY_ENVIRONMENT_NAME ?? '(local)'}\n`,
  );

  console.log('=== XARAJATLAR ===');
  const byBranch = await prisma.expense.groupBy({
    by: ['branchId'],
    where: { deletedAt: null },
    _count: { _all: true },
    _sum: { amount: true },
  });
  console.table(
    byBranch.map((r) => ({
      filial: r.branchId ?? '❌ NULL',
      soni: r._count._all,
      summa: som(r._sum.amount ?? 0),
    })),
  );
  const nullExpenses = await prisma.expense.count({
    where: { deletedAt: null, branchId: null },
  });
  const deletedNull = await prisma.expense.count({
    where: { deletedAt: { not: null }, branchId: null },
  });
  console.log(
    `  filialsiz (aktiv): ${nullExpenses} ta | filialsiz (arxivlangan): ${deletedNull} ta`,
  );

  console.log('\n=== KASSA HISOBLARI ===');
  const accounts = await prisma.cashAccount.findMany({
    where: { deletedAt: null },
    orderBy: [{ branchId: 'asc' }, { type: 'asc' }],
    select: { id: true, name: true, type: true, branchId: true, balance: true },
  });
  const movCounts = await prisma.cashMovement.groupBy({
    by: ['cashAccountId'],
    _count: { _all: true },
  });
  const movMap = new Map(movCounts.map((m) => [m.cashAccountId, m._count._all]));
  console.table(
    accounts.map((a) => ({
      nom: a.name,
      tur: a.type,
      filial: a.branchId ?? '❌ NULL',
      qoldiq: som(a.balance),
      harakatlar: movMap.get(a.id) ?? 0,
    })),
  );

  console.log('\n=== KASSA HARAKATLARI, filial bo\'yicha ===');
  const movByBranch = await prisma.cashMovement.groupBy({
    by: ['branchId'],
    _count: { _all: true },
    _sum: { amount: true },
  });
  console.table(
    movByBranch.map((r) => ({
      'harakat.filial': r.branchId ?? '❌ NULL',
      soni: r._count._all,
      summa: som(r._sum.amount ?? 0),
    })),
  );

  console.log('\n=== DUBLIKAT KASSA TEKSHIRUVI (companyId, branchId, type) ===');
  const dup = await prisma.$queryRaw<
    Array<{ companyId: number; branchId: number | null; type: string; n: bigint }>
  >`
    SELECT "companyId", "branchId", "type", COUNT(*) AS n
    FROM "CashAccount" WHERE "deletedAt" IS NULL
    GROUP BY "companyId", "branchId", "type" HAVING COUNT(*) > 1
  `;
  console.log(
    dup.length ? `  ⚠️ ${dup.length} ta dublikat` : '  ✅ dublikat yo\'q',
  );

  console.log('\n=== FILIALSIZ KASSADAGI HARAKATLAR (ko\'chiriladi) ===');
  const nullAccounts = accounts.filter((a) => a.branchId === null);
  for (const a of nullAccounts) {
    const movs = await prisma.cashMovement.findMany({
      where: { cashAccountId: a.id },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, type: true, amount: true, transactionId: true },
    });
    console.log(
      `  ${a.name} (${a.type}) — qoldiq ${som(a.balance)}, ${movs.length} ta harakat`,
    );
    for (const m of movs) {
      console.log(
        `     ${m.createdAt.toISOString().slice(0, 10)}  ${m.type.padEnd(10)} ${som(m.amount).padStart(12)}`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
