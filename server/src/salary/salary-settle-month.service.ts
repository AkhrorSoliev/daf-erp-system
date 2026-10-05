import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { SettleMonthDto } from './dto/settle-month.dto';
import {
  assertSettleTransitions,
  loadSettleCandidates,
  parseSettlePaidAt,
  SettleCashPlan,
  SettleRow,
  writeSettledRows,
} from './salary-settle-core';

// Kept importable from here: callers and specs predate the core split.
export { buildSettleNote } from './salary-settle-core';
export type { SettleRow } from './salary-settle-core';

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
 *
 * Candidate loading, the date rules and the writer live in
 * `salary-settle-core.ts`, shared with `SalarySettleAllocatedService`.
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
    const { scope, rows, total } = await loadSettleCandidates(
      this.prisma,
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
    const { scope, rows, total } = await loadSettleCandidates(
      this.prisma,
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

    const paidAt = parseSettlePaidAt(dto.paidAt, scope.period.periodStart);

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
    const slicesByBranch = new Map<
      number,
      { cashAccountId: string; amount: number }[]
    >();
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
      const list = slicesByBranch.get(a.branchId) ?? [];
      list.push({ cashAccountId: a.cashAccountId, amount: a.amount });
      slicesByBranch.set(a.branchId, list);
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
      .filter((r) => !slicesByBranch.has(r.branchId as number))
      .map((r) => r.fullName);
    if (noAccount.length) {
      throw new BadRequestException(
        `Bu xodimlar filiali uchun kassa hisobi tanlanmadi: ${noAccount.join(', ')}`,
      );
    }
    // Each branch's named amounts must add up to exactly that branch's payroll:
    // otherwise the cash journal would move a different figure than the ledger.
    const totalByBranch = new Map<number, number>();
    for (const r of rows) {
      const b = r.branchId as number;
      totalByBranch.set(b, (totalByBranch.get(b) ?? 0) + r.amount);
    }
    for (const [branchId, slices] of slicesByBranch) {
      const branchTotal = totalByBranch.get(branchId);
      if (branchTotal === undefined) {
        throw new BadRequestException(
          `Filial #${branchId} uchun bu oyda to'lanmagan oylik yo'q, lekin kassa hisobi tanlangan`,
        );
      }
      const named = slices.reduce((s, x) => s + x.amount, 0);
      if (named !== branchTotal) {
        throw new BadRequestException(
          `Kassalar bo'yicha taqsimot filial jamiga teng emas: ${named} ≠ ${branchTotal}`,
        );
      }
    }

    const sliceByPayment = allocateCashSlices(rows, slicesByBranch);
    assertSettleTransitions(rows);

    const planByPayment = new Map<string, SettleCashPlan>(
      [...sliceByPayment].map(([id, cashSlices]) => [id, { cashSlices }]),
    );
    const { paymentIds, total: settledTotal } = await writeSettledRows(
      this.prisma,
      this.transactions,
      rows,
      planByPayment,
      {
        paidAt,
        paidAtStr: dto.paidAt,
        note: dto.note,
        performedById,
        companyId,
      },
    );

    return {
      month: scope.month,
      paidAt,
      count: paymentIds.length,
      total: settledTotal,
      paymentIds,
    };
  }
}

/**
 * Spread each branch's named per-account amounts across that branch's payments.
 *
 * The operator says "60 000 000 left the kassa and 10 000 000 left the bank",
 * not "teacher A's share left the kassa" — a month later nobody reconstructs the
 * per-person routing, and asking for it would invite guesses. So this walks the
 * payments in order and draws from each account until it is exhausted, letting
 * ONE payment straddle two accounts (`recordSalaryPayment` writes a movement
 * per slice).
 *
 * What this guarantees is the thing the accounts exist for: **each account's
 * total is exactly what the operator stated**. What it does NOT claim is which
 * employee's money came from which drawer — that is an allocation, not a
 * record, and the UI says so. Nothing downstream depends on it: the payment
 * amount, the teacher's balance and the ledger row are all per-employee and
 * untouched by where the cash slice landed.
 *
 * Caller has already checked that per branch Σ(slices) === Σ(payments), so the
 * walk always closes exactly and no payment is left partly unfunded.
 */
export function allocateCashSlices(
  rows: { paymentId: string; branchId: number | null; amount: number }[],
  slicesByBranch: Map<number, { cashAccountId: string; amount: number }[]>,
): Map<string, { cashAccountId: string; amount: number }[]> {
  const out = new Map<string, { cashAccountId: string; amount: number }[]>();
  // Mutable copy — the originals belong to the caller.
  const remaining = new Map<
    number,
    { cashAccountId: string; left: number }[]
  >();
  for (const [branchId, slices] of slicesByBranch) {
    remaining.set(
      branchId,
      slices.map((s) => ({ cashAccountId: s.cashAccountId, left: s.amount })),
    );
  }

  for (const row of rows) {
    if (row.branchId == null) continue;
    const pool = remaining.get(row.branchId);
    if (!pool) continue;

    const slices: { cashAccountId: string; amount: number }[] = [];
    let unfunded = row.amount;
    for (const acc of pool) {
      if (unfunded === 0) break;
      if (acc.left === 0) continue;
      const take = Math.min(acc.left, unfunded);
      slices.push({ cashAccountId: acc.cashAccountId, amount: take });
      acc.left -= take;
      unfunded -= take;
    }
    out.set(row.paymentId, slices);
  }
  return out;
}
