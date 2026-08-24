import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryPaymentStatus, Prisma } from '@prisma/client';
import { SalaryPaymentQueryDto } from './dto/salary-query.dto';
import {
  assertValidTransition,
  SALARY_PAYMENT_TRANSITIONS,
} from '../common/finance/status-transitions';
import { resolvePeriod } from '../common/finance/period-helpers';
import { resolvePayrollBranchScope } from './shared/payroll-branch-scope';

@Injectable()
export class SalaryPaymentService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
  ) {}

  /**
   * "Oylar kesimida" matrix — teachers as rows, months as columns, each cell a
   * SalaryPayment summary. Months are keyed by the Tashkent calendar month of
   * `periodStart` (with cycleStartDay=1 that is the natural calendar month;
   * other start days still bucket by the month the period opens in). Excludes
   * CANCELLED payments. Branch Directors are scoped to their own mainBranch.
   */
  async getMatrix(
    query: { from: string; to: string },
    companyId: number,
    performedById: number,
  ) {
    const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
    const monthKey = (d: Date) => {
      const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
      return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
    };

    const [fy, fm] = query.from.split('-').map(Number);
    const [ty, tm] = query.to.split('-').map(Number);
    // periodStart range: [first day of `from` @00:00 Tashkent, first day of
    // (`to`+1) @00:00 Tashkent) — converted to the stored UTC instant.
    const fromStart = new Date(Date.UTC(fy, fm - 1, 1) - TASHKENT_OFFSET_MS);
    const toEndExclusive = new Date(Date.UTC(ty, tm, 1) - TASHKENT_OFFSET_MS);

    const months: string[] = [];
    for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); ) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }

    // Branch scope: CEO/Administrator see all; Branch Director only their branch.
    const caller = await this.prisma.user.findUnique({
      where: { id: performedById },
      select: {
        mainBranch: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    const roleNames = caller?.roles.map((r) => r.role.name) ?? [];
    const scoped =
      !roleNames.includes('CEO') && !roleNames.includes('Administrator');
    const branchId = scoped ? (caller?.mainBranch ?? undefined) : undefined;

    const payments = await this.prisma.salaryPayment.findMany({
      where: {
        companyId,
        status: { not: SalaryPaymentStatus.CANCELLED },
        periodStart: { gte: fromStart, lt: toEndExclusive },
        ...(branchId !== undefined && { user: { mainBranch: branchId } }),
      },
      select: {
        id: true,
        userId: true,
        amount: true,
        status: true,
        periodStart: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            roles: { select: { role: { select: { id: true, name: true } } } },
          },
        },
        settledExpenses: { select: { amount: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    type Cell = {
      amount: number;
      grossAmount: number;
      status: SalaryPaymentStatus;
      paymentId: string;
    };
    type Row = {
      user: (typeof payments)[number]['user'];
      cells: Record<string, Cell>;
      total: number;
    };
    const rowMap = new Map<number, Row>();
    const monthlyTotals: Record<string, number> = {};

    for (const p of payments) {
      const adv = p.settledExpenses.reduce((s, e) => s + e.amount, 0);
      const key = monthKey(p.periodStart);
      let row = rowMap.get(p.userId);
      if (!row) {
        row = { user: p.user, cells: {}, total: 0 };
        rowMap.set(p.userId, row);
      }
      const prev = row.cells[key];
      // Normally one payment per teacher-month; if more (re-calc artifacts) sum
      // amounts and surface the latest status/paymentId (orderBy createdAt asc).
      row.cells[key] = {
        amount: (prev?.amount ?? 0) + p.amount,
        grossAmount: (prev?.grossAmount ?? 0) + p.amount + adv,
        status: p.status,
        paymentId: p.id,
      };
      row.total += p.amount;
      monthlyTotals[key] = (monthlyTotals[key] ?? 0) + p.amount;
    }

    const rows = [...rowMap.values()].sort((a, b) => b.total - a.total);
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    return { months, rows, monthlyTotals, grandTotal };
  }

  async findPayments(query: SalaryPaymentQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.SalaryPaymentWhereInput = {
      companyId,
      ...(query.userId && { userId: query.userId }),
      ...(query.status && { status: query.status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.salaryPayment.findMany({
        where,
        select: {
          id: true,
          amount: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          paidAt: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              roles: { select: { role: { select: { id: true, name: true } } } },
            },
          },
          paidBy: { select: { id: true, firstName: true, lastName: true } },
          // Advances netted out of this payment — `amount` is already net of
          // them, so we expose their total separately for the list view.
          settledExpenses: { select: { amount: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.salaryPayment.count({ where }),
    ]);

    // Fold settled advances into a per-row total + the gross (pre-advance)
    // amount so the salary table can show "net + avans" at a glance without
    // opening the breakdown drawer.
    const rows = data.map(({ settledExpenses, ...sp }) => {
      const advancesTotal = settledExpenses.reduce((s, e) => s + e.amount, 0);
      return { ...sp, advancesTotal, grossAmount: sp.amount + advancesTotal };
    });

    return { data: rows, total, page, pageSize };
  }

  /**
   * PAID salary runs settled inside the period, for the Excel "Oyliklar"
   * line-item sheet. `status: PAID` + `paidAt` in period mirrors the P&L
   * teacher/admin salary basis, so the sheet's Jami reconciles with
   * Foyda-va-zarar (teacherSalaries + adminSalaries). SalaryPayment has no
   * branchId (company-level payroll), so this is intentionally not
   * branch-scoped — the sheet states that. `grossAmount` re-adds settled
   * advances (which `amount` is already net of) so gross = net + avans.
   */
  async getSalaryLineItemsForPeriod(
    companyId: number,
    query: { startDate?: string; endDate?: string },
  ) {
    const period = resolvePeriod(query.startDate, query.endDate);
    const rows = await this.prisma.salaryPayment.findMany({
      where: {
        companyId,
        status: SalaryPaymentStatus.PAID,
        paidAt: { gte: period.start, lte: period.endTs },
      },
      select: {
        amount: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        paidAt: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        settledExpenses: { select: { amount: true } },
      },
      orderBy: { paidAt: 'asc' },
    });

    return rows.map(({ settledExpenses, ...sp }) => {
      const advancesTotal = settledExpenses.reduce((s, e) => s + e.amount, 0);
      return { ...sp, advancesTotal, grossAmount: sp.amount + advancesTotal };
    });
  }

  async approvePayment(id: string, companyId: number) {
    const payment = await this.prisma.salaryPayment.findFirst({
      where: { id, companyId },
    });
    if (!payment) throw new NotFoundException('Oylik topilmadi');
    assertValidTransition(
      'SalaryPayment',
      SALARY_PAYMENT_TRANSITIONS,
      payment.status,
      SalaryPaymentStatus.APPROVED,
    );

    return this.prisma.salaryPayment.update({
      where: { id },
      data: { status: SalaryPaymentStatus.APPROVED },
    });
  }

  async payPayment(id: string, performedById: number, companyId: number) {
    const payment = await this.prisma.salaryPayment.findFirst({
      where: { id, companyId },
    });
    if (!payment) throw new NotFoundException('Oylik topilmadi');

    // `batchPay` confines a non-CEO caller to their own branch; paying a single
    // payment had NO branch check at all, so the same director could settle
    // another branch's teacher just by passing its id.
    const scope = await resolvePayrollBranchScope(this.prisma, performedById);
    if (scope.kind !== 'all') {
      const payee = await this.prisma.user.findUnique({
        where: { id: payment.userId },
        select: { mainBranch: true },
      });
      if (scope.kind === 'none' || payee?.mainBranch !== scope.branchId) {
        throw new ForbiddenException(
          "Bu xodim sizning filialingizga tegishli emas — oyligini to'lay olmaysiz",
        );
      }
    }
    assertValidTransition(
      'SalaryPayment',
      SALARY_PAYMENT_TRANSITIONS,
      payment.status,
      SalaryPaymentStatus.PAID,
    );

    await this.transactionsService.recordSalaryPayment({
      userId: payment.userId,
      amount: payment.amount,
      salaryPaymentId: payment.id,
      companyId: payment.companyId,
      performedById,
    });

    return this.prisma.salaryPayment.update({
      where: { id },
      data: {
        status: SalaryPaymentStatus.PAID,
        paidAt: new Date(),
        paidById: performedById,
      },
    });
  }

  /**
   * Pay out a batch of salary payments in one click — intended for the 10th of
   * the month, after cron has calculated and CEO has approved the current
   * period. Accepts an optional filter so a branch director or cashier can
   * pay only their scope.
   *
   * Only APPROVED payments are processed; CALCULATED ones are skipped (they
   * need to be approved first). Each payment is wrapped in its own transaction
   * so a failure on one doesn't roll back the others — the caller sees per-
   * payment success/error.
   */
  async batchPay(
    params: {
      companyId: number;
      branchId?: number;
      userIds?: number[];
      statuses?: SalaryPaymentStatus[];
    },
    performedById: number,
  ) {
    const statuses = params.statuses ?? [SalaryPaymentStatus.APPROVED];

    // Enforce branch scope server-side: non-CEO operators (e.g. Branch
    // Directors) are restricted to their own mainBranch regardless of the
    // branchId they passed. JWT does not carry mainBranch, so fetch it.
    const caller = await this.prisma.user.findUnique({
      where: { id: performedById },
      select: {
        mainBranch: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    const isCeo = caller?.roles.some((r) => r.role.name === 'CEO') ?? false;
    const effectiveBranchId = isCeo ? params.branchId : caller?.mainBranch;
    // Fail CLOSED: a non-CEO caller whose mainBranch is unknown used to fall
    // through to "no filter" and could batch-pay EVERY branch's salaries.
    if (!isCeo && effectiveBranchId == null) {
      throw new ForbiddenException(
        "Sizning asosiy filialingiz belgilanmagan — oylik to'lay olmaysiz. Administrator bilan bog'laning.",
      );
    }

    const eligible = await this.prisma.salaryPayment.findMany({
      where: {
        companyId: params.companyId,
        status: { in: statuses },
        ...(params.userIds &&
          params.userIds.length > 0 && { userId: { in: params.userIds } }),
        // Branch scope: SalaryPayment has no branchId directly, so scope via
        // the employee's own branch (D6: one employee, one branch).
        ...(effectiveBranchId != null && {
          user: { mainBranch: effectiveBranchId },
        }),
      },
      select: { id: true, userId: true, amount: true },
    });

    const results: {
      id: string;
      userId: number;
      status: 'PAID' | 'FAILED';
      error?: string;
    }[] = [];

    for (const payment of eligible) {
      try {
        await this.payPayment(payment.id, performedById, params.companyId);
        results.push({
          id: payment.id,
          userId: payment.userId,
          status: 'PAID',
        });
      } catch (err) {
        results.push({
          id: payment.id,
          userId: payment.userId,
          status: 'FAILED',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      total: eligible.length,
      paid: results.filter((r) => r.status === 'PAID').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      results,
    };
  }
}
