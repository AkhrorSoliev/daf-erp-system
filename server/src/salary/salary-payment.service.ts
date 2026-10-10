import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryPaymentStatus, Prisma } from '@prisma/client';
import { SalaryPaymentQueryDto } from './dto/salary-query.dto';
import { PayPaymentDto } from './dto/pay-payment.dto';
import {
  assertValidTransition,
  SALARY_PAYMENT_TRANSITIONS,
} from '../common/finance/status-transitions';
import { resolvePeriod } from '../common/finance/period-helpers';
import { rethrowAsConflict } from '../common/transaction-conflict';
import {
  payrollUserWhere,
  resolvePayrollBranchScope,
} from './shared/payroll-branch-scope';
import { parseSettlePaidAt, SETTLE_TX } from './salary-settle-core';
import { SALARY_PAID_EVENT, SalaryPaidPayload } from './salary-events';

const ALREADY_PAID = 'Bu oylik allaqachon berilgan';

@Injectable()
export class SalaryPaymentService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private events: EventEmitter2,
  ) {}

  /**
   * "Oylar kesimida" matrix — teachers as rows, months as columns, each cell a
   * SalaryPayment summary. Months are keyed by the Tashkent calendar month of
   * `periodStart` (with cycleStartDay=1 that is the natural calendar month;
   * other start days still bucket by the month the period opens in). Excludes
   * CANCELLED payments. Confined to the caller's payroll scope: the CEO sees
   * every branch, anyone else the employees of their branches, a caller with
   * no branch nothing.
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

    // The payroll scope, failing closed. This was a hand-rolled
    // `!CEO && !Administrator` check on `mainBranch`: an Administrator saw
    // every branch, and so did a director whose `mainBranch` was null.
    const scope = await resolvePayrollBranchScope(this.prisma, performedById);
    if (scope.kind === 'none') {
      return { months, rows: [], monthlyTotals: {}, grandTotal: 0 };
    }
    const userWhere = payrollUserWhere(scope);

    const payments = await this.prisma.salaryPayment.findMany({
      where: {
        companyId,
        status: { not: SalaryPaymentStatus.CANCELLED },
        periodStart: { gte: fromStart, lt: toEndExclusive },
        ...(userWhere && { user: userWhere }),
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

  /**
   * Salary payments, newest first, of the employees inside the caller's
   * payroll scope: every branch for the CEO, nothing for a caller with no
   * branch.
   */
  async findPayments(
    query: SalaryPaymentQueryDto,
    companyId: number,
    performedById: number,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const scope = await resolvePayrollBranchScope(this.prisma, performedById);
    if (scope.kind === 'none') return { data: [], total: 0, page, pageSize };
    const userWhere = payrollUserWhere(scope);

    const where: Prisma.SalaryPaymentWhereInput = {
      companyId,
      ...(query.userId && { userId: query.userId }),
      ...(query.status && { status: query.status }),
      ...(userWhere && { user: userWhere }),
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

  /**
   * What both ways of paying one salary check first: the payment is the
   * company's (404), is not PAID yet (409), the caller is not the payee unless
   * they are the CEO (403), may pay that payee's branch (403) and the
   * status may move to PAID (400). Returns the payee's home branch and bot
   * chat, read once for the callers.
   *
   * `batchPay` confines a non-CEO caller to their own branch; paying a single
   * payment had NO branch check at all, so the same director could settle
   * another branch's teacher just by passing its id.
   */
  private async loadPayable(
    id: string,
    performedById: number,
    companyId: number,
  ) {
    const payment = await this.prisma.salaryPayment.findFirst({
      where: { id, companyId },
    });
    if (!payment) throw new NotFoundException('Oylik topilmadi');
    if (payment.status === SalaryPaymentStatus.PAID) {
      throw new ConflictException(ALREADY_PAID);
    }

    const scope = await resolvePayrollBranchScope(this.prisma, performedById);
    // CEO decision (10.10.2026): nobody but the CEO pays their own salary;
    // another manager does. `batchPay` comes through here too, so a
    // caller's own row in a batch is reported FAILED with this reason.
    if (scope.kind !== 'all' && payment.userId === performedById) {
      throw new ForbiddenException(
        "Bu sizning oyligingiz — uni o'zingiz to'lay olmaysiz. Oylikni boshqa rahbar to'laydi.",
      );
    }
    const payee = await this.prisma.user.findUnique({
      where: { id: payment.userId },
      select: { mainBranch: true, telegramChatId: true },
    });
    // Paying stays on the caller's HOME branch, like `batchPay` and the
    // payments list: the other attached branches widen what a director may
    // see (A2.8), not what they may pay. No `mainBranch` pays nothing.
    if (
      scope.kind !== 'all' &&
      (scope.kind === 'none' ||
        scope.mainBranch == null ||
        payee?.mainBranch !== scope.mainBranch)
    ) {
      throw new ForbiddenException(
        "Bu xodim sizning filialingizga tegishli emas — oyligini to'lay olmaysiz",
      );
    }
    assertValidTransition(
      'SalaryPayment',
      SALARY_PAYMENT_TRANSITIONS,
      payment.status,
      SalaryPaymentStatus.PAID,
    );
    return { payment, payee };
  }

  /**
   * «Berildi» (B3 spec §5.2): hand one APPROVED salary over on the day the
   * caller names, from the accounts the caller names. Every refusal comes
   * before any write; the write is one Serializable transaction (re-read →
   * ledger row with the cash/card slices → PAID); `salary.paid` goes out only
   * after it committed. Its own writer rather than `writeSettledRows`: the
   * ledger keeps «Oylik to'landi» and no settle marker lands in `note`.
   *
   * A 0 so'm payment (advances took the whole salary) moves no money: no
   * ledger row, no accounts — just PAID.
   */
  async payPayment(
    id: string,
    dto: PayPaymentDto,
    performedById: number,
    companyId: number,
  ) {
    const { payment, payee } = await this.loadPayable(
      id,
      performedById,
      companyId,
    );

    // `2026-02-31` rolls over to 3 March and `2026-13-01` is no date at all,
    // yet both pass the DTO's shape check.
    const day = new Date(`${dto.paidAt}T00:00:00.000Z`);
    if (
      Number.isNaN(day.getTime()) ||
      day.toISOString().slice(0, 10) !== dto.paidAt
    ) {
      throw new BadRequestException(
        "Sana noto'g'ri — kalendarda bunday kun yo'q",
      );
    }
    const paidAt = parseSettlePaidAt(dto.paidAt, payment.periodStart);

    const branchId = payee?.mainBranch;
    if (branchId == null) {
      throw new BadRequestException(
        "Xodimning filiali aniqlanmagan — oylikni berib bo'lmaydi",
      );
    }

    const sliced = dto.cashSlices.reduce((s, x) => s + x.amount, 0);
    if (sliced !== payment.amount) {
      throw new BadRequestException(
        "Naqd va karta yig'indisi oylikka teng emas",
      );
    }

    if (dto.cashSlices.length > 0) {
      const wanted = [...new Set(dto.cashSlices.map((s) => s.cashAccountId))];
      const accounts = await this.prisma.cashAccount.findMany({
        where: {
          id: { in: wanted },
          companyId,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, branchId: true },
      });
      const branchOf = new Map(accounts.map((a) => [a.id, a.branchId]));
      if (wanted.some((a) => branchOf.get(a) !== branchId)) {
        throw new BadRequestException('Kassa xodim filialiga tegishli emas');
      }
    }

    const note = dto.note?.trim();
    const updated = await this.prisma
      .$transaction(async (tx) => {
        // Another click, or the month settle, may have paid it since the
        // checks above; the fresh status also catches a row cancelled meanwhile.
        const fresh = await tx.salaryPayment.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!fresh || fresh.status === SalaryPaymentStatus.PAID) return null;
        assertValidTransition(
          'SalaryPayment',
          SALARY_PAYMENT_TRANSITIONS,
          fresh.status,
          SalaryPaymentStatus.PAID,
        );

        if (payment.amount > 0) {
          await this.transactionsService.recordSalaryPayment(
            {
              userId: payment.userId,
              amount: payment.amount,
              salaryPaymentId: payment.id,
              companyId: payment.companyId,
              performedById,
              cashSlices: dto.cashSlices,
            },
            tx,
          );
        }
        return tx.salaryPayment.update({
          where: { id },
          data: {
            status: SalaryPaymentStatus.PAID,
            paidAt,
            paidById: performedById,
            ...(note && { note }),
          },
        });
      }, SETTLE_TX)
      .catch(rethrowAsConflict);
    if (!updated) throw new ConflictException(ALREADY_PAID);

    // After the commit, never inside it: the payee is told.
    this.events.emit(SALARY_PAID_EVENT, {
      salaryPaymentId: id,
      companyId,
    } satisfies SalaryPaidPayload);
    return { ...updated, notified: payee?.telegramChatId != null };
  }

  /**
   * The pre-«Berildi» way: the branch's default account, `paidAt` = now, no
   * split asked for. Only `batchPay` still comes here (no client calls it).
   */
  private async payWithDefaultAccount(
    id: string,
    performedById: number,
    companyId: number,
  ) {
    const { payment } = await this.loadPayable(id, performedById, companyId);

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
   * payment success/error. A non-CEO caller's own payment is one such
   * failure: `payPayment` refuses it (CEO decision, 10.10.2026).
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
        await this.payWithDefaultAccount(
          payment.id,
          performedById,
          params.companyId,
        );
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
