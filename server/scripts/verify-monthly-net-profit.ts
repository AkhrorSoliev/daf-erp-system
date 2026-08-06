/**
 * VERIFY canonical getMonthlyNetProfit against PROD — READ-ONLY.
 *
 * Instantiates the REAL service classes directly (NO NestFactory → no crons,
 * no telegram polling, no side effects) and replicates ReportsService
 * .getMonthlyNetProfit's body, so we see EXACTLY what the Foyda card + Excel
 * "Sof foyda" will now show. Also prints the OLD card netProfit for contrast.
 *
 * Usage:  railway run npx ts-node scripts/verify-monthly-net-profit.ts
 *         flags: --months=2026-06,2026-07
 * Writes NOTHING.
 */
import { PrismaClient } from '@prisma/client';
import { som, dbEnvLabel, printHeader, section, run } from './lib/check-cli';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalaryStaffMonthlyService } from '../src/salary/salary-monthly-staff.service';
import { SalaryMonthlyService } from '../src/salary/salary-monthly.service';
import { ReportsFinancialService } from '../src/reports/reports-financial.service';
import { ReportsProfitLossService } from '../src/reports/reports-profit-loss.service';
import { buildNetProfit } from '../src/reports/reports-excel.helpers';

const COMPANY_ID = 1001;
const argv = process.argv.slice(2);
const MONTHS = (() => {
  const m = argv.find((a) => a.startsWith('--months='));
  return m ? m.split('=')[1].split(',') : ['2026-06', '2026-07'];
})();

async function main(prismaClient: PrismaClient) {
  const prisma = prismaClient as unknown as PrismaService;
  const staff = new SalaryStaffMonthlyService(prisma);
  const salaryMonthly = new SalaryMonthlyService(prisma, staff);
  const financial = new ReportsFinancialService(prisma);
  const profitLoss = new ReportsProfitLossService(prisma);

  printHeader('VERIFY — kanonik getMonthlyNetProfit (card + Excel)');
  console.log(`  Baza: ${dbEnvLabel()}`);

  const ceo = await prisma.user.findFirst({
    where: {
      companyId: COMPANY_ID,
      deletedAt: null,
      roles: { some: { role: { name: 'CEO' } } },
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!ceo) throw new Error('CEO topilmadi');
  console.log(`  performedById (CEO): ${ceo.id} — ${ceo.firstName ?? ''} ${ceo.lastName ?? ''}`.trim());

  for (const month of MONTHS) {
    const [y, m] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    // `null` = every branch: a CEO caller who has not picked one in the header
    // switcher. The whole-company figure is what this script verifies.
    const branchIds = null;

    const [recognizedRevenue, sm, pl, outflows, old] = await Promise.all([
      financial.getRecognizedRevenue(COMPANY_ID, {
        start: new Date(Date.UTC(y, m - 1, 1)),
        end: new Date(Date.UTC(y, m, 1)),
        branchIds,
      }),
      salaryMonthly.getMonthly({ month }, COMPANY_ID, ceo.id),
      profitLoss.getProfitLoss(COMPANY_ID, { startDate, endDate, branchIds }),
      financial.getPeriodOutflows(COMPANY_ID, { startDate, endDate, branchIds }),
      financial.getFinancialOverview(COMPANY_ID, {
        startDate,
        endDate,
        branchIds,
      }),
    ]);

    const np = buildNetProfit(pl, sm, outflows, month, recognizedRevenue);

    section(`${month}  (${np.teacherSalaryHasTopup ? 'top-up bor' : 'top-up YO‘Q'})`);
    console.log(`  ESKI card netProfit (kassa − naqd oylik) : ${som(old.netProfit)}   ← soxta`);
    console.log('  ─── YANGI (kanonik — card + Excel bir xil) ───');
    console.log(`    Dars tushumi (recognized)      : ${som(np.revenue)}   [${np.revenueBasis}]`);
    console.log(`  − Ustoz oyligi                   : ${som(np.teacherSalary)}   [${np.teacherSalaryBasis}${np.teacherSalaryHasTopup ? ' + qo‘shimcha' : ''}]`);
    console.log(`  − Admin oyligi                   : ${som(np.adminSalary)}`);
    console.log(`  − Operatsion xarajat (avanssiz)  : ${som(np.operatingExpenses)}`);
    console.log(`  − Qaytarishlar (refund)          : ${som(np.refunds)}`);
    console.log(`  ═ SOF FOYDA                      : ${som(np.netProfit)}   (marja ${np.netMarginPercent}%)`);
    console.log(`    (memo: write-off ${som(np.memo.writeOffs)}, avans ${som(np.memo.advances)})`);
    console.log(`    salary.totals: covered=${som(sm.totals.covered)} markaz=${som(sm.totals.centerFunded)} fullDeserved=${som(sm.totals.fullDeserved)}`);
  }
  console.log('\n  Bu — card/Excel aynan ko‘rsatadigan raqamlar. Read-only, hech narsa o‘zgarmadi.\n');
}

run(main);
