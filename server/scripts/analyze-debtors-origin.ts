/**
 * analyze-debtors-origin — READ-ONLY.
 *
 * Answers three questions about the current debtor population:
 *  1) How many "faol o'quvchi" (Students-page stat: isActive + has enrollment)?
 *  2) How many "qarzdor" (Students-page stat: balance < 0, ANY status)?
 *     How much of that overlaps with the active set?
 *  3) From which month is each debtor in debt — reconstructed from the
 *     append-only ledger (same math as getMonthlyDebtRecovery).
 *
 * Usage:
 *   railway run npx ts-node scripts/analyze-debtors-origin.ts          (prod)
 *   npx ts-node scripts/analyze-debtors-origin.ts                      (dev .env)
 */
import { PrismaClient, StudentStatus, TransactionType } from '@prisma/client';
import { som, printHeader, section, printTable, run } from './lib/check-cli';

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

/** First instant of the FOLLOWING Tashkent month — the month-end boundary. */
function monthEndBoundary(monthKey: string): Date {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1) - TASHKENT_OFFSET_MS);
}
function tashkentMonthKey(d: Date): string {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}
function enumerateMonths(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let [y, m] = fromKey.split('-').map(Number);
  const [ty, tm] = toKey.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}
function label(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${UZ_MONTHS[m - 1]} ${y}`;
}

async function main(prisma: PrismaClient) {
  printHeader('Qarzdorlar tahlili — qaysi oydan qarzdor');

  // Pick the company with the most students (the real tenant).
  const grouped = await prisma.student.groupBy({
    by: ['companyId'],
    _count: true,
    orderBy: { _count: { companyId: 'desc' } },
  });
  const companyId = grouped[0]?.companyId;
  if (companyId == null) {
    console.log('Hech qanday o‘quvchi topilmadi.');
    return;
  }
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, systemStartDate: true },
  });
  console.log(`  Kompaniya: ${company?.name ?? companyId} (#${companyId})`);

  const baseWhere = { companyId, deletedAt: null } as const;

  // ── 1) The two stat-card counts (Students page) ─────────────────────────
  const [statsTotal, activeCount, debtorAnyStatus, debtorActiveOnly] =
    await Promise.all([
      prisma.student.count({ where: baseWhere }),
      prisma.student.count({
        where: {
          ...baseWhere,
          isActive: true,
          enrollments: { some: { deletedAt: null } },
        },
      }),
      // Students-page "Qarzdorlar" stat: balance < 0, ANY status.
      prisma.student.count({ where: { ...baseWhere, balance: { lt: 0 } } }),
      // /payments/debtors definition: status ACTIVE + balance < 0.
      prisma.student.count({
        where: { ...baseWhere, status: StudentStatus.ACTIVE, balance: { lt: 0 } },
      }),
    ]);

  section('Sonlar');
  printTable(
    ['Ko‘rsatkich', 'Soni'],
    [
      ['Jami o‘quvchi (arxivsiz)', statsTotal],
      ['Faol o‘quvchi (isActive + enrollment)', activeCount],
      ['Qarzdor — Students page (balance<0, har qanday status)', debtorAnyStatus],
      ['Qarzdor — /payments/debtors (ACTIVE + balance<0)', debtorActiveOnly],
    ],
    ['l', 'r'],
  );

  // ── 2) Overlap: are the debtors inside the active set? ──────────────────
  const debtors = await prisma.student.findMany({
    where: { ...baseWhere, balance: { lt: 0 } },
    select: { id: true, balance: true, status: true, isActive: true },
  });
  const byStatus = new Map<string, { n: number; debt: number }>();
  for (const d of debtors) {
    const key = d.status;
    const cur = byStatus.get(key) ?? { n: 0, debt: 0 };
    cur.n += 1;
    cur.debt += -d.balance;
    byStatus.set(key, cur);
  }
  section('Qarzdorlar status kesimida (Students-page ta’rifi bo‘yicha)');
  printTable(
    ['Status', 'Soni', 'Qarz (so‘m)'],
    [...byStatus.entries()].map(([s, v]) => [s, v.n, som(v.debt)]),
    ['l', 'r', 'r'],
  );

  // ── 3) Debt origin: reconstruct month-end balances from the ledger ──────
  const floorKey = company?.systemStartDate
    ? tashkentMonthKey(company.systemStartDate)
    : '2026-05';
  const nowKey = tashkentMonthKey(new Date());
  // Reconstructable CLOSED month-ends = every month up to (but excluding) the
  // in-progress current month. Current month "as of now" = live balance.
  const closedMonths = enumerateMonths(floorKey, nowKey).filter((k) => k < nowKey);

  const debtorIds = debtors.map((d) => d.id);
  const balByStudent = new Map(debtors.map((d) => [d.id, d.balance]));

  // For each closed month-end, Σ signed amount AFTER the boundary → reconstruct.
  // A debtor's balAsOf(monthEnd) = liveBalance − Σ(amount, createdAt >= boundary).
  const balAsOf: Record<string, Map<number, number>> = {};
  for (const monthKey of closedMonths) {
    const boundary = monthEndBoundary(monthKey);
    const moves = await prisma.transaction.groupBy({
      by: ['studentId'],
      where: {
        companyId,
        studentId: { in: debtorIds },
        createdAt: { gte: boundary },
      },
      _sum: { amount: true },
    });
    const moveMap = new Map<number, number>();
    for (const m of moves) {
      if (m.studentId != null) moveMap.set(m.studentId, m._sum.amount ?? 0);
    }
    const m = new Map<number, number>();
    for (const id of debtorIds) {
      m.set(id, (balByStudent.get(id) ?? 0) - (moveMap.get(id) ?? 0));
    }
    balAsOf[monthKey] = m;
  }

  // "Qaysi oydan qarzdor" = the earliest CLOSED month-end at which the student
  // was already negative AND stayed negative through every later month-end and
  // to now. If negative at the very first reconstructable month-end → the debt
  // was carried in from the system start ("boshidan / o‘tish davridan").
  const originBucket = new Map<string, { n: number; debt: number }>();
  const CARRIED = `${label(floorKey)} yoki avvaldan`;
  const THIS_MONTH = `${label(nowKey)} (shu oy)`;

  for (const d of debtors) {
    let origin: string | null = null;
    for (const monthKey of closedMonths) {
      if ((balAsOf[monthKey].get(d.id) ?? 0) < 0) {
        origin =
          monthKey === closedMonths[0] ? CARRIED : label(monthKey);
        break; // earliest month they were already in debt
      }
    }
    // Not negative at any closed month-end → became a debtor this month.
    if (origin == null) origin = THIS_MONTH;

    const cur = originBucket.get(origin) ?? { n: 0, debt: 0 };
    cur.n += 1;
    cur.debt += -d.balance;
    originBucket.set(origin, cur);
  }

  // Order buckets chronologically: carried-in, then each closed month, then this month.
  const order = [CARRIED, ...closedMonths.slice(1).map(label), THIS_MONTH];
  section('Qaysi oydan qarzdor (ledger rekonstruksiyasi)');
  printTable(
    ['Qachondan', 'Qarzdorlar', 'Qarz (so‘m)'],
    order
      .filter((k) => originBucket.has(k))
      .map((k) => {
        const v = originBucket.get(k)!;
        return [k, v.n, som(v.debt)];
      }),
    ['l', 'r', 'r'],
  );

  const totalDebt = debtors.reduce((s, d) => s + -d.balance, 0);
  console.log(
    `\n  Jami: ${debtors.length} qarzdor · ${som(totalDebt)} so‘m qarz`,
  );
}

run(main);
