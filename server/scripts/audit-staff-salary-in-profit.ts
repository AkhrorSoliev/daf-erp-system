/**
 * audit-staff-salary-in-profit — READ-ONLY.
 *
 * Foyda hisobida xodimlar oyligi «BERILGAN» (naqd to'langan) raqam bilan
 * ayiriladi, ustoz oyligi esa «ISHLANGAN» bilan. Oylik keyingi oyda
 * to'langani uchun joriy oy ichida berilgan = 0 bo'lib turadi va foyda
 * o'shancha ortiqcha ko'rinadi.
 *
 * Bu skript ikkala raqamni yonma-yon chiqaradi: hozir nima ayirilayotgani va
 * tuzatilgandan keyin nima ayirilishi.
 *
 * Usage: railway run npx ts-node scripts/audit-staff-salary-in-profit.ts [YYYY-MM ...]
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalaryMonthlyService } from '../src/salary/salary-monthly.service';
import { SalaryStaffMonthlyService } from '../src/salary/salary-monthly-staff.service';
import { som, printTable, section, dbEnvLabel, dbHost } from './lib/check-cli';

@Module({
  imports: [PrismaModule],
  providers: [SalaryMonthlyService, SalaryStaffMonthlyService],
})
class M {}

const TZ = 5 * 3600 * 1000;

async function main() {
  const app = await NestFactory.createApplicationContext(M, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);
  const monthly = app.get(SalaryMonthlyService);

  console.log(`DB: ${dbHost()} [${dbEnvLabel()}]`);

  const ceo = await prisma.user.findFirst({
    where: { deletedAt: null, roles: { some: { role: { name: 'CEO' } } } },
    select: { id: true, companyId: true },
  });
  if (!ceo) throw new Error('CEO topilmadi');

  const months = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
  if (months.length === 0) {
    const now = new Date(Date.now() + TZ);
    const cur = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const prevD = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prev = `${prevD.getUTCFullYear()}-${String(prevD.getUTCMonth() + 1).padStart(2, '0')}`;
    months.push(prev, cur);
  }

  section('XODIMLAR OYLIGI — foyda hisobida');
  const rows: (string | number)[][] = [];

  for (const month of months) {
    const sm = await monthly.getMonthly({ month }, ceo.companyId, ceo.id);

    // ISHLANGAN: kunlarga proratsiya qilingan xodim oyligi (tuzatilgandan keyin).
    const deserved = sm.staffTotals?.monthly ?? 0;

    // BERILGAN: hozir foydadan ayiriladigan raqam — accrual'siz (ya'ni
    // ustoz bo'lmagan) PAID SalaryPayment lar, shu oyda to'langan.
    const [y, m] = month.split('-').map(Number);
    const paidRows = await prisma.salaryPayment.findMany({
      where: {
        companyId: ceo.companyId,
        status: 'PAID',
        paidAt: {
          gte: new Date(Date.UTC(y, m - 1, 1) - TZ),
          lt: new Date(Date.UTC(y, m, 1) - TZ),
        },
      },
      select: { amount: true, _count: { select: { accruals: true } } },
    });
    const paidStaff = paidRows
      .filter((p) => p._count.accruals === 0)
      .reduce((s, p) => s + p.amount, 0);

    rows.push([
      month,
      sm.staff?.length ?? 0,
      som(deserved),
      som(paidStaff),
      som(deserved - paidStaff),
    ]);
  }

  printTable(
    ['Oy', 'Xodim', 'ISHLANGAN (bo\'lishi kerak)', 'BERILGAN (hozir)', 'Farq'],
    rows,
    ['l', 'r', 'r', 'r', 'r'],
  );
  console.log(
    "\n  «Farq» = foyda hozir shu miqdorga ORTIQCHA ko'rsatilayotgani.",
  );

  section("XODIMLAR RO'YXATI (joriy oy)");
  const cur = months[months.length - 1];
  const sm = await monthly.getMonthly({ month: cur }, ceo.companyId, ceo.id);
  printTable(
    ['ID', 'Ism', 'Oylik (ishlangan)', 'Avans', "To'lanishi kerak"],
    (sm.staff ?? []).map((r: any) => [
      r.user.id,
      `${r.user.firstName} ${r.user.lastName}`.trim().slice(0, 24),
      som(r.monthly),
      som(r.advances),
      som(r.netToPay),
    ]),
    ['r', 'l', 'r', 'r', 'r'],
  );

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
