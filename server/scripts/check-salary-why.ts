/**
 * check-salary-why — READ-ONLY. Explains why only some teachers got a salary
 * calculated for the 30.04→31.05 period: for every teacher with a config, show
 * (a) their config version effectiveFrom dates, and (b) how many unpaid,
 * non-reversed accruals fall inside the period.
 */
import { PrismaClient } from '@prisma/client';
import { som, day, printHeader, section, printTable, run } from './lib/check-cli';

async function main(prisma: PrismaClient) {
  printHeader('Nega faqat 2 ustoz? — accrual + config versiya tahlili');

  const periodStart = new Date('2026-04-30T00:00:00.000Z');
  const periodEnd = new Date('2026-05-31T23:59:59.999Z');

  const configs = await prisma.employeeSalaryConfig.findMany({
    where: { isActive: true, groupId: null },
    select: {
      id: true,
      userId: true,
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: { userId: 'asc' },
  });

  const rows: (string | number)[][] = [];
  for (const c of configs) {
    const versions = await prisma.employeeSalaryConfigVersion.findMany({
      where: { configId: c.id },
      orderBy: { effectiveFrom: 'asc' },
      select: { effectiveFrom: true, value: true, salaryType: true },
    });
    const versSummary = versions
      .map((v) => `${day(v.effectiveFrom)}(${v.value})`)
      .join(', ');

    // unpaid, non-reversed accruals in the settled period (effective-date OR)
    const accruals = await prisma.salaryAccrual.findMany({
      where: {
        userId: c.userId,
        salaryPaymentId: null,
        reversedAt: null,
        OR: [
          { creditPeriodDate: { gte: periodStart, lte: periodEnd } },
          { creditPeriodDate: null, lessonDate: { gte: periodStart, lte: periodEnd } },
        ],
      },
      select: { amount: true, lessonDate: true },
    });
    const total = accruals.reduce((s, a) => s + a.amount, 0);

    // ALSO: count ALL accruals ever for this teacher (any period/status) to see
    // if they simply have none at all.
    const everCount = await prisma.salaryAccrual.count({ where: { userId: c.userId } });

    rows.push([
      `${c.user.firstName} ${c.user.lastName} #${c.userId}`,
      accruals.length,
      som(total),
      everCount,
      versSummary || '—',
    ]);
  }

  section('Har bir ustoz: davrdagi to\'lanmagan accrual + config versiyalari');
  printTable(
    ['ustoz', 'davrAccr', 'summa', 'jamiAccr(barcha)', 'versiyalar effectiveFrom(value)'],
    rows,
    ['l', 'r', 'r', 'r', 'l'],
  );

  console.log(
    '\n  Izoh: "davrAccr" = 30.04→31.05 oralig\'idagi to\'lanmagan, bekor qilinmagan accrual soni.\n' +
      '  Faqat shu ustun > 0 bo\'lgan ustozlarga SalaryPayment yaratiladi.',
  );
}

run(main);
