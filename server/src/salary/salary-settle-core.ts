import { BadRequestException } from '@nestjs/common';
import { Prisma, SalaryPaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import {
  assertValidTransition,
  SALARY_PAYMENT_TRANSITIONS,
} from '../common/finance/status-transitions';
import {
  MonthlyScope,
  resolveMonthlyScope,
} from './shared/resolve-monthly-scope';
import { parseTashkentDateStart } from './shared/resolve-current-period';

/**
 * The parts of "close a payroll month that was paid outside the system" that do
 * not depend on HOW the caller says where the money left from.
 *
 * Two callers: `SalarySettleMonthService` (the «Oylik berilganini tasdiqlash»
 * button — per-branch account totals spread over the payments) and
 * `SalarySettleAllocatedService` (an explicit plan per payment). Both must pick
 * the same rows, apply the same date rules and write through the same code, or
 * the two ways of closing a month would drift apart.
 */

export const SETTLE_TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10000,
  timeout: 15000,
} as const;

/** Ledger + cash-journal wording, so the row explains itself years later. */
export const SETTLE_DESCRIPTION =
  "Oylik to'landi (tashqarida berilgani tasdiqlandi)";

export interface SettleRow {
  paymentId: string;
  userId: number;
  fullName: string;
  branchId: number | null;
  branchName: string | null;
  amount: number;
  status: SalaryPaymentStatus;
}

/** Where one payment's money left from. */
export interface SettleCashPlan {
  cashSlices?: { cashAccountId: string; amount: number }[];
  /** Paid before the payee branch's cash journal began — no movement. */
  predatesCashJournal?: boolean;
}

/**
 * The month's still-unpaid payroll rows.
 *
 * The month → period translation is `resolveMonthlyScope` — the SAME helper
 * the `/salary/monthly` table uses — so a settle can never touch a set the
 * table did not show. CANCELLED and PAID rows are excluded, which is what
 * makes a repeat call a no-op.
 */
export async function loadSettleCandidates(
  prisma: PrismaService,
  month: string | undefined,
  companyId: number,
  performedById: number,
): Promise<{ scope: MonthlyScope; rows: SettleRow[]; total: number }> {
  const scope = await resolveMonthlyScope(
    prisma,
    { month },
    companyId,
    performedById,
  );

  const raw = scope.blocked
    ? []
    : await prisma.salaryPayment.findMany({
        where: {
          companyId,
          status: {
            in: [SalaryPaymentStatus.CALCULATED, SalaryPaymentStatus.APPROVED],
          },
          periodStart: {
            gte: scope.periodStartLow,
            lt: scope.periodStartHigh,
          },
          ...(scope.branchId !== undefined && {
            user: { mainBranch: scope.branchId },
          }),
        },
        select: {
          id: true,
          userId: true,
          amount: true,
          status: true,
          note: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              mainBranch: true,
              branches: {
                select: { branchId: true },
                orderBy: { branchId: 'asc' },
              },
            },
          },
        },
        orderBy: [{ amount: 'desc' }],
      });

  const rows: SettleRow[] = raw.map((p) => ({
    paymentId: p.id,
    userId: p.userId,
    fullName: `${p.user.firstName} ${p.user.lastName}`.trim(),
    // Same rule as `tryResolveUserBranchId`: mainBranch, else the single
    // attached branch. Inlined because the payee list is already loaded and a
    // per-row DB round trip would be pure waste.
    branchId:
      p.user.mainBranch ??
      (p.user.branches.length === 1 ? p.user.branches[0].branchId : null),
    branchName: null,
    amount: p.amount,
    status: p.status,
  }));

  return {
    scope,
    rows,
    total: rows.reduce((s, r) => s + r.amount, 0),
  };
}

/** "YYYY-MM-DD" → 00:00 Tashkent, refusing a future day or one before the period. */
export function parseSettlePaidAt(paidAt: string, periodStart: Date): Date {
  const at = parseTashkentDateStart(paidAt);
  if (at.getTime() > Date.now()) {
    throw new BadRequestException(
      "To'lov sanasi kelajakda bo'lishi mumkin emas",
    );
  }
  if (at.getTime() < periodStart.getTime()) {
    throw new BadRequestException(
      "To'lov sanasi hisoblash davri boshlanishidan oldin bo'lishi mumkin emas",
    );
  }
  return at;
}

/** CALCULATED → APPROVED → PAID must be legal for every row before anything is written. */
export function assertSettleTransitions(rows: SettleRow[]): void {
  for (const r of rows) {
    if (r.status === SalaryPaymentStatus.CALCULATED) {
      assertValidTransition(
        'SalaryPayment',
        SALARY_PAYMENT_TRANSITIONS,
        r.status,
        SalaryPaymentStatus.APPROVED,
      );
    }
    assertValidTransition(
      'SalaryPayment',
      SALARY_PAYMENT_TRANSITIONS,
      SalaryPaymentStatus.APPROVED,
      SalaryPaymentStatus.PAID,
    );
  }
}

/**
 * Write the settlement. One Serializable tx per payment.
 *
 * Each row is re-read under its tx: another request may have paid it between
 * the caller's checks and here, and skipping it keeps the action idempotent.
 */
export async function writeSettledRows(
  prisma: PrismaService,
  transactions: TransactionsService,
  rows: SettleRow[],
  planByPayment: Map<string, SettleCashPlan>,
  meta: {
    paidAt: Date;
    /** The "YYYY-MM-DD" the operator entered — quoted verbatim in the note. */
    paidAtStr: string;
    note?: string;
    performedById: number;
    companyId: number;
  },
): Promise<{ paymentIds: string[]; total: number }> {
  const paymentIds: string[] = [];
  let total = 0;

  for (const r of rows) {
    const plan = planByPayment.get(r.paymentId) ?? {};
    const written = await prisma.$transaction(async (tx) => {
      const fresh = await tx.salaryPayment.findUnique({
        where: { id: r.paymentId },
        select: { status: true, note: true },
      });
      if (!fresh || fresh.status === SalaryPaymentStatus.PAID) return false;

      await transactions.recordSalaryPayment(
        {
          userId: r.userId,
          amount: r.amount,
          salaryPaymentId: r.paymentId,
          companyId: meta.companyId,
          performedById: meta.performedById,
          cashSlices: plan.cashSlices,
          ...(plan.predatesCashJournal && { predatesCashJournal: true }),
          description: SETTLE_DESCRIPTION,
        },
        tx,
      );

      await tx.salaryPayment.update({
        where: { id: r.paymentId },
        data: {
          status: SalaryPaymentStatus.PAID,
          paidAt: meta.paidAt,
          paidById: meta.performedById,
          note: buildSettleNote(fresh.note, meta.paidAtStr, meta.note),
        },
      });
      return true;
    }, SETTLE_TX);

    if (written) {
      paymentIds.push(r.paymentId);
      total += r.amount;
    }
  }

  return { paymentIds, total };
}

/** Audit marker on the payment itself, alongside `paidById` / `paidAt`. */
export function buildSettleNote(
  existing: string | null,
  paidAtStr: string,
  userNote?: string,
): string {
  const parts = [
    existing?.trim(),
    `Tashqarida berilgan oylik tasdiqlandi (${paidAtStr})`,
    userNote?.trim(),
  ].filter((p): p is string => !!p);
  return parts.join(' · ');
}
