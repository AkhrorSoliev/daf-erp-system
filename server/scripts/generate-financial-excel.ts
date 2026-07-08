/**
 * Standalone generator for the "Moliyaviy hisobot" Excel — produces EXACTLY the
 * same workbook the /payments/overview "Excel yuklab olish" button gives in
 * production (same ReportsExcelService, same read-only queries). Bypasses the
 * HTTP layer + full Nest bootstrap (no crons/listeners) by wiring just the
 * report services against a PrismaClient.
 *
 *   Dev:   npx ts-node --transpile-only scripts/generate-financial-excel.ts [start] [end]
 *   Prod:  railway run npx ts-node --transpile-only scripts/generate-financial-excel.ts [start] [end]
 *
 * start/end are optional YYYY-MM-DD; default = current calendar month (the
 * frontend default). Company-wide (CEO view — all branches).
 */
import 'dotenv/config'; // loads server/.env for dev; `railway run` env wins in prod (dotenv doesn't override)
import { Workbook } from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsFinancialService } from '../src/reports/reports-financial.service';
import { ReportsProfitLossService } from '../src/reports/reports-profit-loss.service';
import { ReportsCashFlowService } from '../src/reports/reports-cash-flow.service';
import { ReportsBalanceSheetService } from '../src/reports/reports-balance-sheet.service';
import { ReportsPaymentsService } from '../src/reports/reports-payments.service';
import { ExpensesService } from '../src/expenses/expenses.service';
import { SalaryMonthlyService } from '../src/salary/salary-monthly.service';
import { PaymentsDebtorsService } from '../src/payments/payments-debtors.service';
import { ReportsExcelService } from '../src/reports/reports-excel.service';
import { ReportsOverviewService } from '../src/reports/reports-overview.service';
import { ReportsAttendanceAnalyticsService } from '../src/reports/reports-attendance-analytics.service';
import { ReportsDepartedStudentsService } from '../src/reports/reports-departed-students.service';
import { ReportsDepartedReasonsService } from '../src/reports/reports-departed-reasons.service';
import { ReportsTeacherChangesService } from '../src/reports/reports-teacher-changes.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const startDate = process.argv[2];
  const endDate = process.argv[3];

  // Real service instances; only PrismaService-backed reads are exercised, so
  // the unused constructor deps (TransactionsService, EntityHistoryService) are
  // safely null for the methods this script calls.
  const financial = new ReportsFinancialService(prisma as any);
  const profitLoss = new ReportsProfitLossService(prisma as any);
  const cashFlow = new ReportsCashFlowService(prisma as any);
  const balance = new ReportsBalanceSheetService(prisma as any);
  const payments = new ReportsPaymentsService(prisma as any);
  const expenses = new ExpensesService(prisma as any, null as any, null as any);
  const salaryMonthly = new SalaryMonthlyService(prisma as any);
  const debtors = new PaymentsDebtorsService(prisma as any);

  // Redis-cached operational services (getRoomUtilization / getTeacher* /
  // getAttendanceAnalytics). A no-op cache → always compute fresh (get miss,
  // setex discarded) so the standalone script needs no live Redis.
  const redisStub: any = {
    get: async () => null,
    setex: async () => undefined,
  };
  const overview = new ReportsOverviewService(prisma as any, redisStub);
  const attendanceAnalytics = new ReportsAttendanceAnalyticsService(prisma as any, redisStub);
  const departedStudents = new ReportsDepartedStudentsService(prisma as any);
  const departedReasons = new ReportsDepartedReasonsService(prisma as any);
  const teacherChanges = new ReportsTeacherChangesService(prisma as any);

  const facade: any = {
    getFinancialOverview: (c: number, q: any) => financial.getFinancialOverview(c, q),
    getProfitLoss: (c: number, q: any) => profitLoss.getProfitLoss(c, q),
    getCashFlow: (c: number, q: any) => cashFlow.getCashFlow(c, q),
    getBalanceSheet: (c: number, q: any) => balance.getBalanceSheet(c, q),
    getPaymentLineItems: (c: number, q: any) => payments.getPaymentLineItems(c, q),
    getExpenseLineItems: (c: number, q: any) => expenses.exportAllForReport(c, q),
    getSalaryMonthly: (c: number, month: string, performedById: number) =>
      salaryMonthly.getMonthly({ month }, c, performedById),
    getDebtorLineItems: (c: number, b?: number[]) => debtors.getDebtorLineItems(c, b),
    getFinancialTrend: (c: number, b?: number) => financial.getFinancialTrend(c, b),
    getYearlyTrend: (c: number, b?: number) => financial.getYearlyTrend(c, b),
    getPerBranchSummary: (c: number, q: any) => payments.getPerBranchSummary(c, q),
    getReconciliation: (c: number, q: any) => financial.getReconciliation(c, q),
    getPriorPeriodSummary: (c: number, q: any) => financial.getPriorPeriodSummary(c, q),
    // Operational (non-financial) feeds.
    getKpis: (c: number, q: any) => overview.getKpis(c, q),
    getRoomUtilization: (c: number, q: any) => overview.getRoomUtilization(c, q),
    getGroupAnalytics: (c: number, q: any) => overview.getGroupAnalytics(c, q),
    getLeadAnalytics: (q: any) => overview.getLeadAnalytics(q),
    getTeacherPerformance: (c: number, q: any) => attendanceAnalytics.getTeacherPerformance(c, q),
    getAttendanceAnalytics: (c: number, q: any) => attendanceAnalytics.getAttendanceAnalytics(c, q),
    getDepartedStudentsSummary: (c: number, p: any) => departedStudents.getDepartedStudentsSummary(c, p),
    getDepartedStudentsDynamics: (c: number, p: any) => departedStudents.getDepartedStudentsDynamics(c, p),
    getDepartedStudentsReasons: (c: number, p: any) => departedReasons.getDepartedStudentsReasons(c, p),
    getTeacherChangesList: (c: number, p: any) => teacherChanges.getTeacherChangesList(c, p),
  };

  const excel = new ReportsExcelService(facade);

  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) throw new Error('Company topilmadi');
  const branches = await prisma.branch.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true },
  });
  const branchNames: Record<number, string> = Object.fromEntries(
    branches.map((b) => [b.id, b.name]),
  );

  // A CEO id → getMonthly returns all teachers (company-wide, unscoped).
  const ceo = await prisma.user.findFirst({
    where: {
      companyId: company.id,
      deletedAt: null,
      roles: { some: { role: { name: 'CEO' } } },
    },
    select: { id: true },
  });

  // Optional custom comparison range: argv[4]=compareStart, argv[5]=compareEnd.
  const compareStartDate = process.argv[4];
  const compareEndDate = process.argv[5];
  const compareModes = process.env.COMPARE
    ? process.env.COMPARE.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : compareStartDate && compareEndDate
      ? ['prev', 'yoy', 'custom', 'yearly']
      : ['prev', 'yoy', 'yearly'];

  const buffer = await excel.generate(company.id, {
    startDate,
    endDate,
    companyName: company.name,
    branchLabel: 'Barcha filiallar',
    branchNames,
    performedById: ceo?.id ?? 0,
    compareModes,
    compareStartDate,
    compareEndDate,
  });

  const outDir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = startDate && endDate ? `${startDate}_${endDate}` : new Date().toISOString().slice(0, 10);
  const outPath = path.join(outDir, `moliyaviy-hisobot-${stamp}.xlsx`);
  fs.writeFileSync(outPath, buffer);

  // Re-read the produced workbook and print a summary so we can confirm the
  // reconciliation ties without opening the file.
  const wb = new Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const cell = (sheet: string, col1: string, col: number) => {
    const ws = wb.getWorksheet(sheet);
    let out: any = null;
    ws?.eachRow((r) => {
      if (out == null && String(r.getCell(1).value ?? '') === col1) out = r.getCell(col).value;
    });
    return out;
  };
  const ties: string[] = [];
  wb.getWorksheet('Tekshiruv')?.eachRow((r) => {
    const v = String(r.getCell(5).value ?? '');
    if (v === 'MOS' || v === 'XATO') ties.push(`${v}  ${String(r.getCell(1).value)}`);
  });

  console.log('==================================================');
  console.log(`Fayl:      ${outPath}`);
  console.log(`Hajmi:     ${(buffer.length / 1024).toFixed(1)} KB`);
  console.log(`Kompaniya: ${company.name} (#${company.id}), filiallar: ${branches.length}`);
  console.log(`Varaqlar:  ${wb.worksheets.map((w) => w.name).join(', ')}`);
  console.log(`Davr:      ${cell('Muqova', 'Hisobot davri:', 2)}`);
  console.log(`Sof foyda: ${cell('Asosiy xulosa', 'Sof foyda', 2)}`);
  console.log('--- Tekshiruv (ties) ---');
  ties.forEach((t) => console.log('  ' + t));
  console.log('==================================================');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
