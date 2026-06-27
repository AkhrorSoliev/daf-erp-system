import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryPaymentStatus, Prisma } from '@prisma/client';
import { SalaryPaymentQueryDto } from './dto/salary-query.dto';
import {
  assertValidTransition,
  SALARY_PAYMENT_TRANSITIONS,
} from '../common/finance/status-transitions';

@Injectable()
export class SalaryPaymentService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
  ) {}

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
    const effectiveBranchId = isCeo
      ? params.branchId
      : (caller?.mainBranch ?? undefined);

    const eligible = await this.prisma.salaryPayment.findMany({
      where: {
        companyId: params.companyId,
        status: { in: statuses },
        ...(params.userIds &&
          params.userIds.length > 0 && { userId: { in: params.userIds } }),
        // Branch scope: SalaryPayment has no branchId directly, so scope via
        // the employee's mainBranch.
        ...(effectiveBranchId !== undefined && {
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
