import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import {
  firstOfThisMonthDate,
  firstOfThisMonthUtc,
  tashkentTodayDate,
} from './utils/format.util';

/**
 * The centre's one immutable daily record.
 *
 * Every other figure in the system can be recomputed from the ledger later.
 * This one cannot: «Oy oxiriga kutilyapti» depends on who was enrolled that
 * day, and that roster has moved by the time anyone asks. A day nobody wrote
 * is gone.
 *
 * It used to be written by the 21:00 Telegram cron, and only after a confirmed
 * send — so Sundays and holidays (when that cron short-circuits) left holes. A
 * month whose last day fell on a Sunday therefore had NO closing figure, and
 * the debt ▲/▼ delta silently compared against a three-day-old row while the
 * message said "kechagi kundan" (audit H26). It now runs on its own, every day.
 *
 * Rows are written per branch as well as company-wide from the start. Nothing
 * reads the branch rows yet — but adding the dimension later would leave the
 * past permanently blank, and that is exactly the data that cannot be rebuilt.
 */
@Injectable()
export class DailySnapshotService {
  private readonly logger = new Logger(DailySnapshotService.name);

  constructor(
    private prisma: PrismaService,
    private reports: ReportsService,
  ) {}

  /** One company-wide row plus one row per branch, for today (Tashkent). */
  async persistForCompany(companyId: number): Promise<void> {
    const branches = await this.prisma.branch.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true },
    });
    const scopes: (number | null)[] = [null, ...branches.map((b) => b.id)];

    for (const branchId of scopes) {
      try {
        await this.persistScope(companyId, branchId);
      } catch (e) {
        // One scope failing must not cost the others their row — a missing day
        // is unrecoverable, a missing branch row is merely incomplete.
        this.logger.warn(
          `Snapshot failed for company ${companyId} branch ${branchId ?? 'all'}: ${e}`,
        );
      }
    }
  }

  private async persistScope(companyId: number, branchId: number | null) {
    const date = tashkentTodayDate();
    const month = date.toISOString().slice(0, 7);
    const branchIds = branchId === null ? null : [branchId];
    // Student carries no branchId column — the branch lives on the
    // StudentBranch join, the same predicate every student list filters on.
    const studentBranch =
      branchId === null ? {} : { branches: { some: { branchId } } };

    const [debtors, activeStudents, income, expectation, attribution] =
      await Promise.all([
        this.prisma.student.aggregate({
          where: {
            companyId,
            deletedAt: null,
            status: 'ACTIVE',
            balance: { lt: 0 },
            ...studentBranch,
          },
          _sum: { balance: true },
          _count: true,
        }),
        this.prisma.student.count({
          where: {
            companyId,
            deletedAt: null,
            status: 'ACTIVE',
            ...studentBranch,
          },
        }),
        this.prisma.payment.aggregate({
          where: {
            companyId,
            status: 'COMPLETED',
            // `Payment.createdAt` is a real timestamp, so the Tashkent-shifted
            // month start is the correct bound here (unlike `@db.Date` columns).
            createdAt: { gte: firstOfThisMonthUtc() },
            ...(branchId !== null && { branchId }),
          },
          _sum: { amount: true },
        }),
        this.reports.getMonthlyExpectation(companyId, { month, branchIds }),
        this.reports.getIncomeMonthAttribution(companyId, {
          branchIds,
          startDate: firstOfThisMonthDate().toISOString().slice(0, 10),
          endDate: date.toISOString().slice(0, 10),
        }),
      ]);

    const data = {
      totalDebt: Math.abs(debtors._sum.balance ?? 0),
      debtorCount: debtors._count,
      activeStudents,
      mtdIncome: income._sum.amount ?? 0,
      expectedValue: expectation.expectedValue,
      lessonsHeldValue: attribution.lessonsValue,
      collectedForMonth: attribution.currentMonth,
      // The collection PERCENTAGE is deliberately not stored: it is derivable
      // from the two figures above, and a stored copy can drift from them.
    };

    // NOT an upsert. The compound unique contains a nullable `branchId`, and in
    // Postgres `NULL = NULL` is never true — so an upsert on the company-wide
    // row (branchId IS NULL) would never match the existing row, always attempt
    // an insert, and be rejected by the partial unique index on every re-run
    // after the first. `findFirst` translates the null to `IS NULL` correctly.
    //
    // The read-then-write window is safe here: the cron runs once a day, and the
    // two unique indexes are the backstop if it ever double-fires.
    const existing = await this.prisma.dailyFinancialSnapshot.findFirst({
      where: { companyId, branchId, date },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.dailyFinancialSnapshot.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await this.prisma.dailyFinancialSnapshot.create({
        data: { companyId, branchId, date, ...data },
      });
    }
  }
}
