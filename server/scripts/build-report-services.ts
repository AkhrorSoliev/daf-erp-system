/**
 * ONE standalone wiring of the report services for the `scripts/` folder.
 *
 * Two scripts produce the "Hisobot" workbook outside Nest — the generator and
 * the production pre-flight — and they must exercise the SAME orchestration a
 * CEO's "Excel yuklab olish" click does, or a green pre-flight would prove
 * nothing about the real download. `tsconfig.build.json` excludes `scripts/**`,
 * so nothing type-checks these files: a hand-rolled facade drifts silently as
 * `ReportsExcelService.generate` grows new calls (that is exactly how
 * generate-financial-excel.ts came to die on `getMonthlyDebtRecovery is not a
 * function`). One wiring point is the only durable defence.
 *
 * READ-ONLY by construction: only report READS are reachable from here, and
 * the Redis stub discards its writes.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsService } from '../src/reports/reports.service';
import { ReportsExcelService } from '../src/reports/reports-excel.service';
import { ReportsOverviewService } from '../src/reports/reports-overview.service';
import { ReportsAttendanceAnalyticsService } from '../src/reports/reports-attendance-analytics.service';
import { ReportsFinancialService } from '../src/reports/reports-financial.service';
import { ReportsPaymentsService } from '../src/reports/reports-payments.service';
import { ReportsTeacherChangesService } from '../src/reports/reports-teacher-changes.service';
import { ReportsProfitLossService } from '../src/reports/reports-profit-loss.service';
import { ReportsBalanceSheetService } from '../src/reports/reports-balance-sheet.service';
import { ReportsExpectationService } from '../src/reports/reports-expectation.service';
import { ReportsStudentFlowService } from '../src/reports/reports-student-flow.service';
import { HolidaysService } from '../src/holidays/holidays.service';
import { ExpensesService } from '../src/expenses/expenses.service';
import { SalaryService } from '../src/salary/salary.service';
import { SalaryMonthlyService } from '../src/salary/salary-monthly.service';
import { SalaryStaffMonthlyService } from '../src/salary/salary-monthly-staff.service';
import { PaymentsDebtorsService } from '../src/payments/payments-debtors.service';

/**
 * Builds the REAL ReportsService the HTTP path uses, hand-wired against a
 * PrismaClient instead of Nest DI. Deps the workbook never touches are left
 * null — a wrong assumption there fails loudly with a TypeError rather than
 * silently reporting a different number.
 */
export function buildExcelService(prisma: PrismaService): ReportsExcelService {
  // A no-op cache → always compute fresh (get miss, setex discarded), so the
  // script needs no live Redis and can never read a stale cached figure.
  const redis: any = { get: async () => null, setex: async () => undefined };

  const financial = new ReportsFinancialService(prisma as any);
  const payments = new ReportsPaymentsService(prisma as any);
  const profitLoss = new ReportsProfitLossService(prisma as any);
  const balanceSheet = new ReportsBalanceSheetService(prisma as any);
  const overview = new ReportsOverviewService(prisma as any, redis);
  const attendance = new ReportsAttendanceAnalyticsService(prisma as any, redis);
  const teacherChanges = new ReportsTeacherChangesService(prisma as any);
  const studentFlow = new ReportsStudentFlowService(prisma as any);
  const holidays = new HolidaysService(prisma as any, null as any, null as any, null as any);
  const expectation = new ReportsExpectationService(prisma as any, holidays, redis);
  const expenses = new ExpensesService(prisma as any, null as any, null as any);
  const salaryMonthly = new SalaryMonthlyService(
    prisma as any,
    new SalaryStaffMonthlyService(prisma as any),
  );
  const salary = new SalaryService(
    null as any, // config
    null as any, // accrual
    null as any, // summary
    null as any, // overview
    salaryMonthly,
    null as any, // calculation
    null as any, // payment
    null as any, // settleMonth
  );
  const debtors = new PaymentsDebtorsService(prisma as any);

  const reports = new ReportsService(
    overview,
    attendance,
    financial,
    payments,
    null as any, // teacherPayments
    null as any, // studentPayments
    null as any, // departedStudents
    null as any, // departedLists
    null as any, // departedReasons
    teacherChanges,
    null as any, // centerActivity
    profitLoss,
    null as any, // cashFlow
    balanceSheet,
    expenses,
    null as any, // salaryPayments
    salary,
    debtors,
    redis,
    expectation,
    null as any, // expectationHistory
    studentFlow,
  );

  return new ReportsExcelService(reports);
}
