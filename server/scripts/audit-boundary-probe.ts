/**
 * audit-boundary-probe — READ-ONLY. Oy chegarasidagi (30.06 / 31.07) darslar
 * qaysi davr(lar)ga tushishini QAT'IY tekshiradi + iyun to'lovlarining
 * dublikatlarini sanaydi.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { som, day, printTable, section, dbEnvLabel, dbHost } from './lib/check-cli';
import { computePeriodBounds } from '../src/salary/shared/resolve-current-period';

dotenv.config();

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  console.log(`DB: ${dbHost()} [${dbEnvLabel()}]  TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

  // cycleStartDay = 1 → iyul davri
  const jun = computePeriodBounds(new Date('2026-06-15T00:00:00Z'), 1);
  const jul = computePeriodBounds(new Date('2026-07-15T00:00:00Z'), 1);
  console.log(`\n  IYUN timestamp: ${jun.periodStart.toISOString()} … ${jun.periodEnd.toISOString()}`);
  console.log(`  IYUL timestamp: ${jul.periodStart.toISOString()} … ${jul.periodEnd.toISOString()}`);
  console.log(
    `  IYUN sana:      ${jun.periodStartDate.toISOString().slice(0, 10)} … < ${jun.periodEndDateExclusive.toISOString().slice(0, 10)}`,
  );
  console.log(
    `  IYUL sana:      ${jul.periodStartDate.toISOString().slice(0, 10)} … < ${jul.periodEndDateExclusive.toISOString().slice(0, 10)}`,
  );

  // ── 1. Chegaraviy kun: 30.06 accruallari iyul oynasiga tushadimi? ──────
  section('CHEGARA TESTI — accrual `lessonDate` filtri');
  for (const [label, p] of [
    ['IYUN', jun],
    ['IYUL', jul],
  ] as const) {
    const inWindow = await prisma.salaryAccrual.groupBy({
      by: ['lessonDate'],
      where: {
        reversedAt: null,
        creditPeriodDate: null,
        // `@db.Date` column → unshifted calendar bounds, exclusive upper edge.
        // With the old timestamp pair, 30.06 landed in BOTH windows.
        lessonDate: { gte: p.periodStartDate, lt: p.periodEndDateExclusive },
      },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { lessonDate: 'asc' },
    });
    const first = inWindow[0];
    const last = inWindow[inWindow.length - 1];
    console.log(
      `  ${label} oynasiga tushgan dars sanalari: ${inWindow.length} ta kun — birinchi ${day(first?.lessonDate)} … oxirgi ${day(last?.lessonDate)}`,
    );
  }

  // ── 2. 30.06 kunidagi accruallar — ikkala oyda ham bormi? ──────────────
  section("30.06 DARSLARI — accruallar (iyun to'loviga bog'langanmi?)");
  const jun30 = await prisma.salaryAccrual.findMany({
    where: {
      reversedAt: null,
      lessonDate: {
        gte: new Date('2026-06-30T00:00:00.000Z'),
        lte: new Date('2026-06-30T23:59:59.999Z'),
      },
    },
    select: {
      userId: true,
      amount: true,
      salaryPaymentId: true,
      isCenterTopUp: true,
      user: { select: { firstName: true, lastName: true } },
      salaryPayment: { select: { periodStart: true, status: true } },
    },
  });
  const byUser = new Map<number, { name: string; total: number; linked: number; unlinked: number; n: number }>();
  for (const a of jun30) {
    const e = byUser.get(a.userId) ?? {
      name: `${a.user.firstName} ${a.user.lastName}`.slice(0, 22),
      total: 0,
      linked: 0,
      unlinked: 0,
      n: 0,
    };
    e.total += a.amount;
    e.n += 1;
    if (a.salaryPaymentId) e.linked += a.amount;
    else e.unlinked += a.amount;
    byUser.set(a.userId, e);
  }
  printTable(
    ['ID', 'Ustoz', 'Accrual soni', '30.06 jami', "Iyun to'loviga kirgan", "Bog'lanmagan"],
    [...byUser.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([id, e]) => [id, e.name, e.n, som(e.total), som(e.linked), som(e.unlinked)]),
    ['r', 'l', 'r', 'r', 'r', 'r'],
  );
  console.log(
    `  JAMI 30.06 accrual: ${som(jun30.reduce((s, a) => s + a.amount, 0))} so'm`,
  );

  // ── 3. 30.06 davomati (gap sweep uchun) ───────────────────────────────
  const att0630 = await prisma.attendance.count({
    where: {
      status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
      date: {
        gte: new Date('2026-06-30T00:00:00.000Z'),
        lte: new Date('2026-06-30T23:59:59.999Z'),
      },
    },
  });
  console.log(`  30.06 dagi hisob-kitobga kiruvchi davomat yozuvlari: ${att0630} ta`);

  // ── 4. Iyun davri to'lovlari — dublikatlar ────────────────────────────
  section("BIR DAVRDA >1 SalaryPayment (dublikat)");
  const pays = await prisma.salaryPayment.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: {
      id: true,
      userId: true,
      periodStart: true,
      amount: true,
      status: true,
      createdAt: true,
      _count: { select: { accruals: true } },
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }],
  });
  const grouped = new Map<string, typeof pays>();
  for (const p of pays) {
    const k = `${p.userId}::${day(p.periodStart)}`;
    const arr = grouped.get(k) ?? [];
    arr.push(p);
    grouped.set(k, arr);
  }
  const dupRows: (string | number)[][] = [];
  let dupExtra = 0;
  for (const [k, arr] of grouped) {
    if (arr.length < 2) continue;
    arr.slice(1).forEach((p) => (dupExtra += p.amount));
    for (const p of arr)
      dupRows.push([
        k,
        `${p.user.firstName} ${p.user.lastName}`.slice(0, 20),
        som(p.amount),
        p.status,
        p._count.accruals,
        day(p.createdAt),
      ]);
  }
  printTable(
    ["Ustoz::davr", 'Ism', 'Summa', 'Holat', 'Accrual', 'Yaratilgan'],
    dupRows,
    ['l', 'l', 'r', 'l', 'r', 'l'],
  );
  console.log(`  Qo'shimcha (ikkinchi) to'lovlar jami: ${som(dupExtra)} so'm`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
