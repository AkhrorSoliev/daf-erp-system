import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import {
  assertSettleTransitions,
  loadSettleCandidates,
  parseSettlePaidAt,
  SettleCashPlan,
  SettleRow,
  writeSettledRows,
} from './salary-settle-core';

/** Where one payment's money left from — exactly one of the two. */
export interface AllocatedPaymentPlan {
  paymentId: string;
  /** Accounts and amounts; must sum to the payment. */
  cashSlices?: { cashAccountId: string; amount: number }[];
  /** Paid before the payee branch's cash journal began: no movement at all. */
  predatesCashJournal?: boolean;
}

export interface SettleAllocatedInput {
  /** "YYYY-MM" — must reach the report unchanged (see the floor check). */
  month: string;
  /** "YYYY-MM-DD" — the day the money changed hands. */
  paidAt: string;
  note?: string;
  payments: AllocatedPaymentPlan[];
}

export interface SettleAllocatedResult {
  month: string;
  paidAt: Date;
  dryRun: boolean;
  /** Rows settled — or, on a dry run, rows that would be. */
  count: number;
  total: number;
  /** Empty on a dry run. */
  paymentIds: string[];
  rows: SettleRow[];
  /** What leaves each named account. */
  perAccount: { cashAccountId: string; amount: number }[];
  /** Paid out before the cash journal — recorded without any movement. */
  predatesCashJournalTotal: number;
}

/**
 * Close a payroll month from an explicit plan per payment.
 *
 * The «Oylik berilganini tasdiqlash» button (`SalarySettleMonthService`) takes
 * one amount per account and spreads it across the branch's payments in
 * order — right when nobody reconstructs who got what from which drawer. When
 * the split IS decided per person (the CEO's 27.09.2026 rule for May–August
 * 2026: a teacher's pay half cash, half card; staff all cash), and when a month
 * was paid out before the branch's cash journal existed, the caller has to be
 * able to say so payment by payment. That is this service; the checks, the
 * date rules and the writer are the button's own (`salary-settle-core.ts`).
 *
 * Nothing is written until every row checks out, and `dryRun` stops right
 * there with the totals the write would produce.
 */
@Injectable()
export class SalarySettleAllocatedService {
  constructor(
    private prisma: PrismaService,
    private transactions: TransactionsService,
  ) {}

  async settle(
    input: SettleAllocatedInput,
    companyId: number,
    performedById: number,
    opts: { dryRun?: boolean } = {},
  ): Promise<SettleAllocatedResult> {
    const { scope, rows, total } = await loadSettleCandidates(
      this.prisma,
      input.month,
      companyId,
      performedById,
    );

    if (rows.length === 0) {
      throw new BadRequestException(
        "Bu oyda to'lanmagan oylik yo'q — hammasi allaqachon to'langan yoki bekor qilingan",
      );
    }
    // The report floors a month before the company's start date to that start
    // month. Settling the floor month instead of the one asked for would close
    // the wrong payroll.
    if (scope.month !== input.month) {
      throw new BadRequestException(
        `So'ralgan oy (${input.month}) hisobotda ${scope.month} ga o'zgardi — hech narsa yozilmadi`,
      );
    }

    // ─── The plan names exactly the month's unpaid rows ─────────────────────
    const planById = new Map<string, AllocatedPaymentPlan>();
    for (const p of input.payments) {
      if (planById.has(p.paymentId)) {
        throw new BadRequestException(
          `Rejada bitta to'lov ikki marta berilgan: ${p.paymentId}`,
        );
      }
      planById.set(p.paymentId, p);
    }
    const rowIds = new Set(rows.map((r) => r.paymentId));
    const missing = rows
      .filter((r) => !planById.has(r.paymentId))
      .map((r) => r.fullName);
    const extra = [...planById.keys()].filter((id) => !rowIds.has(id));
    if (missing.length || extra.length) {
      throw new BadRequestException(
        `Reja oyning to'lanmagan ro'yxatiga mos emas — ro'yxat o'zgargan bo'lishi mumkin. ` +
          `Rejada yo'q: ${missing.join(', ') || '—'}; ortiqcha: ${extra.length} ta`,
      );
    }

    const paidAt = parseSettlePaidAt(input.paidAt, scope.period.periodStart);

    // ─── Each payment: a pre-journal flag, or slices that sum to it ─────────
    for (const r of rows) {
      const plan = planById.get(r.paymentId) as AllocatedPaymentPlan;
      const slices = plan.cashSlices ?? [];
      if (plan.predatesCashJournal) {
        if (slices.length) {
          throw new BadRequestException(
            `${r.fullName}: kassa jurnalidan oldingi to'lovga kassa hisobi berib bo'lmaydi`,
          );
        }
        continue;
      }
      if (slices.some((s) => !Number.isInteger(s.amount) || s.amount < 0)) {
        throw new BadRequestException(
          `${r.fullName}: kassa summasi butun va manfiy bo'lmagan son bo'lishi kerak`,
        );
      }
      const named = slices.reduce((s, x) => s + x.amount, 0);
      if (named !== r.amount) {
        throw new BadRequestException(
          `${r.fullName}: kassa taqsimoti to'lovga teng emas: ${named} ≠ ${r.amount}`,
        );
      }
    }

    // ─── Accounts: exist, active, this company's, and the payee's branch ────
    const accountIds = [
      ...new Set(
        [...planById.values()].flatMap((p) =>
          (p.cashSlices ?? []).map((s) => s.cashAccountId),
        ),
      ),
    ];
    const accounts = accountIds.length
      ? await this.prisma.cashAccount.findMany({
          where: {
            id: { in: accountIds },
            companyId,
            isActive: true,
            deletedAt: null,
          },
          select: { id: true, branchId: true, name: true },
        })
      : [];
    const accById = new Map(accounts.map((a) => [a.id, a]));
    for (const r of rows) {
      const plan = planById.get(r.paymentId) as AllocatedPaymentPlan;
      for (const s of plan.cashSlices ?? []) {
        const acc = accById.get(s.cashAccountId);
        if (!acc) {
          throw new BadRequestException(
            'Tanlangan kassa hisobi topilmadi yoki faol emas',
          );
        }
        // Each branch pays its own payroll from its own drawer (D4).
        if (acc.branchId !== r.branchId) {
          throw new BadRequestException(
            `«${acc.name}» hisobi ${r.fullName} filialiga tegishli emas — har filial o'z kassasidan to'laydi`,
          );
        }
      }
    }

    assertSettleTransitions(rows);

    // ─── Totals the write produces ──────────────────────────────────────────
    const perAccountMap = new Map<string, number>();
    let predatesCashJournalTotal = 0;
    const planByPayment = new Map<string, SettleCashPlan>();
    for (const r of rows) {
      const plan = planById.get(r.paymentId) as AllocatedPaymentPlan;
      if (plan.predatesCashJournal) {
        predatesCashJournalTotal += r.amount;
        planByPayment.set(r.paymentId, { predatesCashJournal: true });
        continue;
      }
      const slices = plan.cashSlices ?? [];
      for (const s of slices) {
        perAccountMap.set(
          s.cashAccountId,
          (perAccountMap.get(s.cashAccountId) ?? 0) + s.amount,
        );
      }
      planByPayment.set(r.paymentId, { cashSlices: slices });
    }
    const perAccount = [...perAccountMap].map(([cashAccountId, amount]) => ({
      cashAccountId,
      amount,
    }));

    if (opts.dryRun) {
      return {
        month: scope.month,
        paidAt,
        dryRun: true,
        count: rows.length,
        total,
        paymentIds: [],
        rows,
        perAccount,
        predatesCashJournalTotal,
      };
    }

    const written = await writeSettledRows(
      this.prisma,
      this.transactions,
      rows,
      planByPayment,
      {
        paidAt,
        paidAtStr: input.paidAt,
        note: input.note,
        performedById,
        companyId,
      },
    );

    return {
      month: scope.month,
      paidAt,
      dryRun: false,
      count: written.paymentIds.length,
      total: written.total,
      paymentIds: written.paymentIds,
      rows,
      perAccount,
      predatesCashJournalTotal,
    };
  }
}
