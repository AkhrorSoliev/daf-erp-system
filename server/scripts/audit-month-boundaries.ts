/**
 * audit-month-boundaries — READ-ONLY.
 *
 * H3 tuzatilgandan keyin: har bir oy chegarasidagi OXIRGI kunda dars bormi?
 *
 * Eski (buzuq) mantiq oyning davr boshini Toshkentga siljitgan timestamp bilan
 * berardi — u UTC sanaga kesilganda OLDINGI oyning oxirgi kuniga tushardi. Ya'ni
 * o'sha kun ikki davrda sanalardi. Ta'sir faqat o'sha kunda dars BO'LSA yuzaga
 * keladi. Bu skript qaysi chegara kunlari haqiqatan zararli bo'lganini
 * ko'rsatadi — ya'ni qaysi oylarning raqami siljigan.
 *
 * Shuningdek allaqachon yozilgan SalaryPayment larni ro'yxatlaydi: ularning
 * summasi bazada muzlatilgan, ya'ni chegara tuzatilishi ularni o'zgartirmaydi.
 *
 * Usage: railway run npx ts-node scripts/audit-month-boundaries.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { som, printTable, section, dbEnvLabel, dbHost } from './lib/check-cli';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL yo'q");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Oyning oxirgi kuni — eski mantiq uni keyingi oyga ham qo'shib yuborardi. */
const BOUNDARY_DAYS = [
  '2026-03-31',
  '2026-04-30',
  '2026-05-31',
  '2026-06-30',
  '2026-07-31',
];

async function main() {
  console.log(`DB: ${dbHost()} [${dbEnvLabel()}]`);

  section("CHEGARA KUNLARI — o'sha kunda dars/accrual bormi?");
  const rows: (string | number)[][] = [];
  for (const day of BOUNDARY_DAYS) {
    const d = new Date(`${day}T00:00:00.000Z`);
    const [acc, att] = await Promise.all([
      prisma.salaryAccrual.aggregate({
        where: { reversedAt: null, lessonDate: d },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.attendance.count({
        where: { date: d, status: { in: ['PRESENT', 'LATE', 'ABSENT'] } },
      }),
    ]);
    const n = acc._count._all;
    rows.push([
      day,
      att,
      n,
      som(acc._sum.amount ?? 0),
      n > 0 ? '⚠️ ikki oyda sanalgan' : '— zararsiz',
    ]);
  }
  printTable(
    ['Chegara kuni', 'Davomat', 'Accrual', 'Summa', 'Eski mantiqda'],
    rows,
    ['l', 'r', 'r', 'r', 'l'],
  );

  section('YOZILGAN OYLIK TO\'LOVLARI (summasi bazada muzlatilgan)');
  const pays = await prisma.salaryPayment.findMany({
    orderBy: [{ periodStart: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      userId: true,
      amount: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      paidAt: true,
      createdAt: true,
      _count: { select: { accruals: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  });
  if (!pays.length) {
    console.log("  (yozilgan oylik to'lovi yo'q)");
  } else {
    printTable(
      ['Davr boshi', 'Ustoz', 'Summa', 'Holat', "To'langan", 'Accrual', 'Yaratilgan'],
      pays.map((p) => [
        p.periodStart.toISOString().slice(0, 10),
        `${p.user.firstName} ${p.user.lastName}`.trim().slice(0, 22),
        som(p.amount),
        p.status,
        p.paidAt ? p.paidAt.toISOString().slice(0, 10) : '—',
        p._count.accruals,
        p.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      ]),
      ['l', 'l', 'r', 'l', 'l', 'r', 'l'],
    );
    const byStatus = new Map<string, { n: number; sum: number }>();
    for (const p of pays) {
      const e = byStatus.get(p.status) ?? { n: 0, sum: 0 };
      e.n++;
      e.sum += p.amount;
      byStatus.set(p.status, e);
    }
    console.log('\n  Holat bo\'yicha:');
    for (const [st, e] of byStatus) {
      console.log(`    ${st}: ${e.n} ta, ${som(e.sum)} so'm`);
    }
  }

  section("ACCRUAL → TO'LOVGA BOG'LANGANMI");
  const [linked, unlinked] = await Promise.all([
    prisma.salaryAccrual.aggregate({
      where: { reversedAt: null, salaryPaymentId: { not: null } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.salaryAccrual.aggregate({
      where: { reversedAt: null, salaryPaymentId: null },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  console.log(
    `  To'lovga bog'langan: ${linked._count._all} ta, ${som(linked._sum.amount ?? 0)} so'm`,
  );
  console.log(
    `  Bog'lanmagan:        ${unlinked._count._all} ta, ${som(unlinked._sum.amount ?? 0)} so'm`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
