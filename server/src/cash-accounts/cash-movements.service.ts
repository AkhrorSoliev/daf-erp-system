import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CashAccountType,
  CashMovement,
  CashMovementType,
  ExpensePaymentMethod,
  PaymentMethod,
  Prisma,
} from '@prisma/client';

/**
 * Map a student payment method to the cash account type that should receive it.
 * CASH lands in the kassa; gateway/transfer money lands in the bank account.
 */
export function cashTypeForPaymentMethod(
  method: PaymentMethod,
): CashAccountType {
  return method === PaymentMethod.CASH
    ? CashAccountType.CASH
    : CashAccountType.BANK;
}

/** Expense payment method → cash account type. */
export function cashTypeForExpenseMethod(
  method: ExpensePaymentMethod,
): CashAccountType {
  return method === ExpensePaymentMethod.CARD
    ? CashAccountType.BANK
    : CashAccountType.CASH;
}

/**
 * Append-only cash ledger. ONE CashMovement row per real money movement; the
 * CashAccount.balance is the denormalized canonical figure, updated atomically
 * inside the same locked transaction. Same append-only + reversal discipline as
 * the Transaction ledger (see TransactionsWriteService).
 *
 * Integration helpers (recordInflow / recordOutflow / reverseByTransactionId)
 * are designed to be called from INSIDE an existing Serializable `$transaction`
 * (the payment / expense / salary / refund tx) by passing the `tx` client.
 *
 * Missing-account contract: a movement for a NAMED branch whose account does
 * not exist THROWS. It used to no-op with a warning, which meant money moved
 * in the Transaction ledger while the cash journal recorded nothing and nobody
 * noticed. Only a branch-less caller (a CEO salary, which spans branches) still
 * degrades to a warning. Open each branch's accounts before it takes money —
 * `scripts/backfill-cash-accounts.ts` seeds them.
 */
@Injectable()
export class CashMovementsService {
  private readonly logger = new Logger(CashMovementsService.name);

  constructor(private prisma: PrismaService) {}

  private runInTx<T>(
    callback: (client: Prisma.TransactionClient) => Promise<T>,
    tx?: Prisma.TransactionClient,
  ): Promise<T> {
    if (tx) return callback(tx);
    return this.prisma.$transaction(callback, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 15000,
    });
  }

  /** Lock a cash account row for an atomic balance update (SELECT FOR UPDATE). */
  private async lockAccount(
    client: Prisma.TransactionClient,
    cashAccountId: string,
  ): Promise<{ id: string; balance: number; branchId: number | null }> {
    const [acc] = await client.$queryRaw<
      { id: string; balance: number; branchId: number | null }[]
    >`SELECT id, balance, "branchId" FROM "CashAccount" WHERE id = ${cashAccountId} FOR UPDATE`;
    if (!acc) {
      throw new Error(`CashAccount ${cashAccountId} topilmadi`);
    }
    return acc;
  }

  /**
   * Resolve which cash account a movement belongs to. Explicit id wins; else
   * the branch account of the preferred type. Returns null when nothing
   * matches (or when no branch was given at all).
   */
  private async resolveAccountId(
    client: Prisma.TransactionClient,
    params: {
      companyId: number;
      branchId?: number | null;
      preferType: CashAccountType;
      explicitId?: string;
    },
  ): Promise<string | null> {
    if (params.explicitId) return params.explicitId;
    if (params.branchId == null) return null;

    // Branch account only. The company-wide (branchId = null) fallback that
    // used to sit here is gone: money physically leaves a branch's drawer, so
    // booking it against a company-level account made that account drift
    // negative while the branch's balance stayed too high by the same amount
    // (PROD: −1 107 000 so'm across 4 refunds and a salary payment). Under
    // "each branch carries its own costs" there is no company-level bucket to
    // fall back to — a missing branch account is a setup error, not a default.
    const branchAcc = await client.cashAccount.findFirst({
      where: {
        companyId: params.companyId,
        branchId: params.branchId,
        type: params.preferType,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return branchAcc?.id ?? null;
  }

  /**
   * Core writer: lock the account, append a movement, update the balance.
   * `signedAmount` is the balance delta (inflow > 0, outflow < 0).
   */
  private async record(
    client: Prisma.TransactionClient,
    params: {
      cashAccountId: string;
      type: CashMovementType;
      signedAmount: number;
      companyId: number;
      branchId?: number | null;
      transactionId?: string;
      description?: string;
      performedById?: number;
    },
  ) {
    const acc = await this.lockAccount(client, params.cashAccountId);
    const balanceBefore = acc.balance;
    const balanceAfter = balanceBefore + params.signedAmount;

    const movement = await client.cashMovement.create({
      data: {
        cashAccountId: params.cashAccountId,
        type: params.type,
        amount: params.signedAmount,
        balanceBefore,
        balanceAfter,
        transactionId: params.transactionId,
        description: params.description,
        performedById: params.performedById,
        branchId: params.branchId ?? acc.branchId,
        companyId: params.companyId,
      },
    });

    await client.cashAccount.update({
      where: { id: params.cashAccountId },
      data: { balance: balanceAfter },
    });

    return movement;
  }

  /**
   * Record real money INTO a cash account (student payment landed). No-op when
   * no account is configured for the (company, branch, type).
   */
  async recordInflow(
    params: {
      companyId: number;
      branchId?: number | null;
      amount: number; // positive
      preferType?: CashAccountType;
      cashAccountId?: string;
      transactionId?: string;
      description?: string;
      performedById?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    if (params.amount <= 0) return null;
    return this.runInTx(async (client) => {
      const accountId = await this.resolveAccountId(client, {
        companyId: params.companyId,
        branchId: params.branchId,
        preferType: params.preferType ?? CashAccountType.CASH,
        explicitId: params.cashAccountId,
      });
      if (!accountId) {
        // A named branch with no account is a setup error, not a default:
        // silently skipping used to leave money moved in the ledger with
        // nothing in the cash journal, and nobody found out. Fail loudly so
        // the branch's accounts get opened. A branch-less caller (e.g. a CEO
        // salary, which spans branches) still degrades to a warning.
        if (params.branchId != null) {
          throw new Error(
            `Filial #${params.branchId} uchun ${params.preferType ?? 'CASH'} kassa hisobi topilmadi — ` +
              `pul harakati yozilmadi. Filial uchun kassa oching.`,
          );
        }
        this.logger.warn(
          `Cash inflow skipped: no ${params.preferType ?? 'CASH'} account for company ${params.companyId} (no branch given)`,
        );
        return null;
      }
      return this.record(client, {
        cashAccountId: accountId,
        type: CashMovementType.INFLOW,
        signedAmount: params.amount,
        companyId: params.companyId,
        branchId: params.branchId,
        transactionId: params.transactionId,
        description: params.description,
        performedById: params.performedById,
      });
    }, tx);
  }

  /**
   * Record real money OUT of a cash account (expense / salary / refund paid).
   * No-op when no account is configured. `amount` is positive.
   */
  async recordOutflow(
    params: {
      companyId: number;
      branchId?: number | null;
      amount: number; // positive
      preferType?: CashAccountType;
      cashAccountId?: string;
      transactionId?: string;
      description?: string;
      performedById?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    if (params.amount <= 0) return null;
    return this.runInTx(async (client) => {
      const accountId = await this.resolveAccountId(client, {
        companyId: params.companyId,
        branchId: params.branchId,
        preferType: params.preferType ?? CashAccountType.CASH,
        explicitId: params.cashAccountId,
      });
      if (!accountId) {
        // A named branch with no account is a setup error, not a default:
        // silently skipping used to leave money moved in the ledger with
        // nothing in the cash journal, and nobody found out. Fail loudly so
        // the branch's accounts get opened. A branch-less caller (e.g. a CEO
        // salary, which spans branches) still degrades to a warning.
        if (params.branchId != null) {
          throw new Error(
            `Filial #${params.branchId} uchun ${params.preferType ?? 'CASH'} kassa hisobi topilmadi — ` +
              `pul harakati yozilmadi. Filial uchun kassa oching.`,
          );
        }
        this.logger.warn(
          `Cash outflow skipped: no ${params.preferType ?? 'CASH'} account for company ${params.companyId} (no branch given)`,
        );
        return null;
      }
      return this.record(client, {
        cashAccountId: accountId,
        type: CashMovementType.OUTFLOW,
        signedAmount: -params.amount,
        companyId: params.companyId,
        branchId: params.branchId,
        transactionId: params.transactionId,
        description: params.description,
        performedById: params.performedById,
      });
    }, tx);
  }

  /**
   * Reverse every still-active cash movement linked to a source Transaction.
   * Called when the underlying payment / expense / refund is reversed so the
   * cash account balance unwinds in lock-step. Idempotent: already-reversed
   * movements are skipped.
   */
  async reverseByTransactionId(
    transactionId: string,
    params: { performedById?: number; reason?: string },
    tx?: Prisma.TransactionClient,
  ) {
    return this.runInTx(async (client) => {
      const originals = await client.cashMovement.findMany({
        where: { transactionId, reversedAt: null },
        select: {
          id: true,
          cashAccountId: true,
          amount: true,
          companyId: true,
          branchId: true,
        },
      });

      const reversals: CashMovement[] = [];
      for (const original of originals) {
        await client.cashMovement.update({
          where: { id: original.id },
          data: { reversedAt: new Date() },
        });
        const reversal = await this.record(client, {
          cashAccountId: original.cashAccountId,
          type: CashMovementType.ADJUSTMENT,
          signedAmount: -original.amount,
          companyId: original.companyId,
          branchId: original.branchId,
          transactionId,
          description: params.reason
            ? `Bekor qilindi: ${params.reason}`
            : 'Kassa harakati bekor qilindi',
          performedById: params.performedById,
        });
        await client.cashMovement.update({
          where: { id: reversal.id },
          data: { reversedTransactionId: original.id },
        });
        reversals.push(reversal);
      }
      return reversals;
    }, tx);
  }

  /** Move money between two cash accounts (TRANSFER_OUT + TRANSFER_IN). */
  async transfer(
    params: {
      fromAccountId: string;
      toAccountId: string;
      amount: number; // positive
      companyId: number;
      description?: string;
      performedById?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.runInTx(async (client) => {
      const out = await this.record(client, {
        cashAccountId: params.fromAccountId,
        type: CashMovementType.TRANSFER_OUT,
        signedAmount: -params.amount,
        companyId: params.companyId,
        description: params.description ?? "Hisoblar o'rtasida o'tkazma",
        performedById: params.performedById,
      });
      const inn = await this.record(client, {
        cashAccountId: params.toAccountId,
        type: CashMovementType.TRANSFER_IN,
        signedAmount: params.amount,
        companyId: params.companyId,
        description: params.description ?? "Hisoblar o'rtasida o'tkazma",
        performedById: params.performedById,
      });
      return { out, in: inn };
    }, tx);
  }

  /** Reconciliation / opening-balance ADJUSTMENT for a signed delta. */
  async adjust(
    params: {
      cashAccountId: string;
      signedAmount: number;
      companyId: number;
      description: string;
      performedById?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.runInTx(async (client) => {
      return this.record(client, {
        cashAccountId: params.cashAccountId,
        type: CashMovementType.ADJUSTMENT,
        signedAmount: params.signedAmount,
        companyId: params.companyId,
        description: params.description,
        performedById: params.performedById,
      });
    }, tx);
  }
}
