/**
 * audit-branch-scope-sum — READ-ONLY.
 *
 * The business invariant behind P7 / H13–H17: for every branch-attributable
 * figure, Σ(branches) must equal the company total. It broke because several
 * report queries ignored the branch entirely, so selecting the empty Namangan
 * branch reported Fargona's numbers under Namangan's name.
 *
 * This measures the predicates the reports now use, straight against the
 * database, and prints the per-branch split beside the company total. A row
 * where `Σ ≠ jami` means some rows carry no branch (or a branch outside the
 * company) and are invisible to every per-branch report.
 *
 * Usage: railway run npx ts-node scripts/audit-branch-scope-sum.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { som, printTable, section, dbEnvLabel, dbHost } from './lib/check-cli';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL yo'q");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Current Tashkent calendar month, the window the reports default to. */
function monthWindow(): { start: Date; end: Date; label: string } {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1)),
    end: new Date(Date.UTC(y, m + 1, 1)),
    label: `${y}-${String(m + 1).padStart(2, '0')}`,
  };
}

async function main() {
  console.log(`DB: ${dbHost()} [${dbEnvLabel()}]`);
  const { start, end, label } = monthWindow();

  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("Kompaniya topilmadi");
  const companyId = company.id;

  const branches = await prisma.branch.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });

  section(`FILIAL QAMROVI — ${label} (kompaniya #${companyId})`);
  console.log(`  Filiallar: ${branches.map((b) => `#${b.id} ${b.name}`).join(', ')}\n`);

  /** One metric, measured company-wide and per branch with the SAME predicate. */
  type Metric = {
    name: string;
    /** `null` = no branch filter (company total). */
    measure: (ids: number[] | null) => Promise<number>;
  };

  const branchWhere = (ids: number[] | null) =>
    ids === null ? {} : { branchId: { in: ids } };
  const studentWhere = (ids: number[] | null) =>
    ids === null ? {} : { branches: { some: { branchId: { in: ids } } } };
  const userWhere = (ids: number[] | null) =>
    ids === null
      ? {}
      : {
          user: {
            OR: [
              { mainBranch: { in: ids } },
              { branches: { some: { branchId: { in: ids } } } },
            ],
          },
        };

  const metrics: Metric[] = [
    {
      name: 'Tushum (COMPLETED)',
      measure: async (ids) =>
        (
          await prisma.payment.aggregate({
            where: {
              companyId,
              status: 'COMPLETED',
              createdAt: { gte: start, lt: end },
              ...branchWhere(ids),
            },
            _sum: { amount: true },
          })
        )._sum.amount ?? 0,
    },
    {
      name: 'Xarajat',
      measure: async (ids) =>
        (
          await prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              date: { gte: start, lt: end },
              ...branchWhere(ids),
            },
            _sum: { amount: true },
          })
        )._sum.amount ?? 0,
    },
    {
      // H13's headline: an empty branch reported the whole company's debt.
      name: 'Jami qarz',
      measure: async (ids) =>
        Math.abs(
          (
            await prisma.student.aggregate({
              where: {
                companyId,
                deletedAt: null,
                status: 'ACTIVE',
                balance: { lt: 0 },
                ...studentWhere(ids),
              },
              _sum: { balance: true },
            })
          )._sum.balance ?? 0,
        ),
    },
    {
      name: 'Qarzdorlar soni',
      measure: (ids) =>
        prisma.student.count({
          where: {
            companyId,
            deletedAt: null,
            status: 'ACTIVE',
            balance: { lt: 0 },
            ...studentWhere(ids),
          },
        }),
    },
    {
      name: "Faol o'quvchilar",
      measure: (ids) =>
        prisma.student.count({
          where: {
            companyId,
            deletedAt: null,
            status: 'ACTIVE',
            ...studentWhere(ids),
          },
        }),
    },
    {
      // Payroll carries no branch of its own — it has to come from the employee.
      name: "To'langan oylik",
      measure: async (ids) =>
        (
          await prisma.salaryPayment.aggregate({
            where: {
              companyId,
              status: 'PAID',
              paidAt: { gte: start, lt: end },
              ...userWhere(ids),
            },
            _sum: { amount: true },
          })
        )._sum.amount ?? 0,
    },
    {
      name: 'Dars hisoblandi (LESSON_DEDUCTION)',
      measure: async (ids) =>
        Math.abs(
          (
            await prisma.transaction.aggregate({
              where: {
                companyId,
                type: 'LESSON_DEDUCTION',
                createdAt: { gte: start, lt: end },
                ...branchWhere(ids),
              },
              _sum: { amount: true },
            })
          )._sum.amount ?? 0,
        ),
    },
  ];

  const rows: (string | number)[][] = [];
  let failures = 0;
  for (const metric of metrics) {
    const total = await metric.measure(null);
    const perBranch: number[] = [];
    for (const b of branches) perBranch.push(await metric.measure([b.id]));
    const sum = perBranch.reduce((a, v) => a + v, 0);
    const ok = sum === total;
    if (!ok) failures++;
    rows.push([
      metric.name,
      ...perBranch.map((v) => som(v)),
      som(sum),
      som(total),
      ok ? '✅' : `❌ ${som(total - sum)} yo'qolgan`,
    ]);
  }

  printTable(
    [
      "Ko'rsatkich",
      ...branches.map((b) => b.name),
      'Σ filiallar',
      'Jami',
      'Holat',
    ],
    rows,
    ['l', ...branches.map(() => 'r' as const), 'r', 'r', 'l'],
  );

  console.log('');
  if (failures === 0) {
    console.log('  ✅ Har bir ko\'rsatkichda Σ(filiallar) = jami');
  } else {
    console.log(
      `  ❌ ${failures} ta ko'rsatkichda farq bor — filialsiz qatorlar mavjud.`,
    );
    console.log(
      "     Ular hech bir filial hisobotiga tushmaydi. Backfill kerak.",
    );
  }

  section('FILIALSIZ QATORLAR (hech bir hisobotga tushmaydi)');
  const [noBranchPayments, noBranchTx, studentsNoBranch] = await Promise.all([
    prisma.payment.count({ where: { companyId, branchId: null } }),
    prisma.transaction.count({ where: { companyId, branchId: null } }),
    prisma.student.count({
      where: { companyId, deletedAt: null, branches: { none: {} } },
    }),
  ]);
  printTable(
    ['Nima', 'Soni'],
    [
      ["Filialsiz to'lov", noBranchPayments],
      ['Filialsiz tranzaksiya', noBranchTx],
      ["Filialsiz o'quvchi", studentsNoBranch],
    ],
    ['l', 'r'],
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
