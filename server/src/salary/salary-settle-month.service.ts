import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SalaryPaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import {
  assertValidTransition,
  SALARY_PAYMENT_TRANSITIONS,
} from '../common/finance/status-transitions';
import { resolveMonthlyScope } from './shared/resolve-monthly-scope';
import { parseTashkentDateStart } from './shared/resolve-current-period';
import { SettleMonthDto } from './dto/settle-month.dto';

const TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10000,
  timeout: 15000,
} as const;

/** Ledger + cash-journal wording, so the row explains itself years later. */
const SETTLE_DESCRIPTION = "Oylik to'landi (tashqarida berilgani tasdiqlandi)";

export interface SettleRow {
  paymentId: string;
  userId: number;
  fullName: string;
  branchId: number | null;
  branchName: string | null;
  amount: number;
  status: SalaryPaymentStatus;
}

export interface SettleMonthPreview {
  month: string;
  period: { periodStart: Date; periodEnd: Date };
  rows: SettleRow[];
  total: number;
  branches: { branchId: number; branchName: string }[];
}

export interface SettleMonthResult {
  month: string;
  paidAt: Date;
  count: number;
  total: number;
  paymentIds: string[];
}

/**
 * Close a whole payroll month that was paid OUTSIDE the system.
 *
 * June and July 2026 were handed over in cash at exactly the calculated
 * amounts, but the rows stayed CALCULATED — so teacher balances carried
 * payouts that had already happened and the kassa read that much too high.
 *
 * Two things make this different from `batchPay`:
 *
 * 1. **The kassa account is named by the caller.** `resolveAccountId` picks the
 *    branch's oldest CASH account, which in production is an empty
 *    «Asosiy kassa» — 130 mln booked there would be a fiction.
 * 2. **Validate everything, then write.** `batchPay` wraps each payment in its
 *    own try/catch and reports failures; that is right for a routine run. Here
 *    the money is irreversible and the operator has just retyped the total, so
 *    a half-settled month is the one outcome nobody can act on.
 */
@Injectable()
export class SalarySettleMonthService {
  constructor(
    private prisma: PrismaService,
    private transactions: TransactionsService,
  ) {}

  async preview(
    month: string | undefined,
    companyId: number,
    performedById: number,
  ): Promise<SettleMonthPreview> {
    const { scope, rows, total } = await this.loadCandidates(
      month,
      companyId,
      performedById,
    );

    const branchIds = [
      ...new Set(
        rows.map((r) => r.branchId).filter((b): b is number => b != null),
      ),
    ];
    const branches = branchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, name: true },
          orderBy: { id: 'asc' },
        })
      : [];
    const nameById = new Map(branches.map((b) => [b.id, b.name]));

    return {
      month: scope.month,
      period: {
        periodStart: scope.period.periodStart,
        periodEnd: scope.period.periodEnd,
      },
      rows: rows.map((r) => ({
        ...r,
        branchName:
          r.branchId != null ? (nameById.get(r.branchId) ?? null) : null,
      })),
      total,
      branches: branchIds.map((id) => ({
        branchId: id,
        branchName: nameById.get(id) ?? `#${id}`,
      })),
    };
  }

  async settle(
    dto: SettleMonthDto,
    companyId: number,
    performedById: number,
  ): Promise<SettleMonthResult> {
    const { scope, rows, total } = await this.loadCandidates(
      dto.month,
      companyId,
      performedById,
    );

    if (rows.length === 0) {
      throw new BadRequestException(
        "Bu oyda to'lanmagan oylik yo'q — hammasi allaqachon to'langan yoki bekor qilingan",
      );
    }

    // Optimistic lock. The operator retyped a total they read on screen; if the
    // set moved since (a cron re-run, another admin), that total is no longer a
    // statement about what will leave, so nothing may leave.
    if (dto.confirmAmount !== total) {
      throw new BadRequestException(
        `Summa mos kelmadi — ro'yxat o'zgargan bo'lishi mumkin. Oynani yangilang. ` +
          `Kutilgan summa: ${total}`,
      );
    }

    const paidAt = parseTashkentDateStart(dto.paidAt);
    if (paidAt.getTime() > Date.now()) {
      throw new BadRequestException(
        "To'lov sanasi kelajakda bo'lishi mumkin emas",
      );
    }
    if (paidAt.getTime() < scope.period.periodStart.getTime()) {
      throw new BadRequestException(
        "To'lov sanasi hisoblash davri boshlanishidan oldin bo'lishi mumkin emas",
      );
    }

    // ─── Kassa accounts: exist, active, and belong to the branch claimed ───
    const requestedIds = dto.accounts.map((a) => a.cashAccountId);
    const accounts = await this.prisma.cashAccount.findMany({
      where: {
        id: { in: requestedIds },
        companyId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, branchId: true, name: true },
    });
    const accById = new Map(accounts.map((a) => [a.id, a]));
    const accountByBranch = new Map<number, string>();
    for (const a of dto.accounts) {
      const found = accById.get(a.cashAccountId);
      if (!found) {
        throw new BadRequestException(
          'Tanlangan kassa hisobi topilmadi yoki faol emas',
        );
      }
      if (found.branchId !== a.branchId) {
        throw new BadRequestException(
          `«${found.name}» hisobi boshqa filialga tegishli — har filial o'z kassasidan to'laydi`,
        );
      }
      accountByBranch.set(a.branchId, a.cashAccountId);
    }

    // ─── Per-payment pre-flight: nothing is written until all of this holds ──
    const noBranch = rows
      .filter((r) => r.branchId == null)
      .map((r) => r.fullName);
    if (noBranch.length) {
      throw new BadRequestException(
        `Bu xodimlarning filiali aniqlanmadi, shuning uchun oylik yozilmadi: ${noBranch.join(', ')}`,
      );
    }
    const noAccount = rows
      .filter((r) => !accountByBranch.has(r.branchId as number))
      .map((r) => r.fullName);
    if (noAccount.length) {
      throw new BadRequestException(
        `Bu xodimlar filiali uchun kassa hisobi tanlanmadi: ${noAccount.join(', ')}`,
      );
    }
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

    // ─── Write. One Serializable tx per payment. ────────────────────────────
    const paymentIds: string[] = [];
    let settledTotal = 0;

    for (const r of rows) {
      const written = await this.prisma.$transaction(async (tx) => {
        // Re-read under the tx: another request may have paid this row between
        // the pre-flight and here. Skipping keeps the action idempotent.
        const fresh = await tx.salaryPayment.findUnique({
          where: { id: r.paymentId },
          select: { status: true, note: true },
        });
        if (!fresh || fresh.status === SalaryPaymentStatus.PAID) return false;

        await this.transactions.recordSalaryPayment(
          {
            userId: r.userId,
            amount: r.amount,
            salaryPaymentId: r.paymentId,
            companyId,
            performedById,
            cashAccountId: accountByBranch.get(r.branchId as number),
            description: SETTLE_DESCRIPTION,
          },
          tx,
        );

        await tx.salaryPayment.update({
          where: { id: r.paymentId },
          data: {
            status: SalaryPaymentStatus.PAID,
            paidAt,
            paidById: performedById,
            note: buildSettleNote(fresh.note, dto.paidAt, dto.note),
          },
        });
        return true;
      }, TX);

      if (written) {
        paymentIds.push(r.paymentId);
        settledTotal += r.amount;
      }
    }

    return {
      month: scope.month,
      paidAt,
      count: paymentIds.length,
      total: settledTotal,
      paymentIds,
    };
  }

  /**
   * The month's still-unpaid payroll rows.
   *
   * The month → period translation is `resolveMonthlyScope` — the SAME helper
   * the `/salary/monthly` table uses — so the button can never settle a set the
   * table did not show. CANCELLED and PAID rows are excluded, which is what
   * makes a repeat call a no-op.
   */
  private async loadCandidates(
    month: string | undefined,
    companyId: number,
    performedById: number,
  ) {
    const scope = await resolveMonthlyScope(
      this.prisma,
      { month },
      companyId,
      performedById,
    );

    const raw = scope.blocked
      ? []
      : await this.prisma.salaryPayment.findMany({
          where: {
            companyId,
            status: {
              in: [
                SalaryPaymentStatus.CALCULATED,
                SalaryPaymentStatus.APPROVED,
              ],
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
