import { Prisma } from '@prisma/client';
import { MIGRATION_REVERSAL } from '../statements/statement-months';
import { uzMonthName } from '../telegram-digest/uzbek-calendar';

/**
 * How a ledger row relates to a cancellation, for the screens that list the
 * raw ledger («Barcha yozuvlar» on the student profile, «Balans tarixi» in
 * the student portal).
 *
 * `reverseTransaction` keeps both rows: it stamps `reversedAt` on the
 * original and writes a counter-row of the SAME type, `reversedTransactionId`
 * pointing back. Listed side by side with nothing to tell them apart, a
 * cancelled lesson charge read as a charge still standing (538 of 1078
 * students carried such pairs on 06.10.2026, 2 375 pairs in all).
 *
 *   - `reversed`: this row was cancelled later, at `at`.
 *   - `undo`: this row cancels an earlier one, written at `originalAt`.
 */
export type ReversalView =
  | { kind: 'reversed'; at: Date; reason: string | null }
  | {
      kind: 'undo';
      originalAt: Date;
      originalAmount: number;
      reason: string | null;
    };

/** The fields `reversalView` reads. Spread into a transaction `select`. */
export const REVERSAL_SELECT = {
  reversedAt: true,
  reversedTransaction: { select: { createdAt: true, amount: true } },
  reversalEntries: {
    select: { createdAt: true, description: true },
    orderBy: { createdAt: 'asc' },
    take: 1,
  },
} satisfies Prisma.TransactionSelect;

type ReversalFields = {
  description: string | null;
  reversedAt: Date | null;
  reversedTransaction: { createdAt: Date; amount: number } | null;
  reversalEntries: { createdAt: Date; description: string | null }[];
};

const PREFIX = 'Bekor qilindi: ';

/** `Oylik to'lovga o'tish migratsiyasi — 2026-09`, as the monthly switch wrote it. */
const MIGRATION_MONTH = new RegExp(`^${MIGRATION_REVERSAL} — \\d{4}-(\\d{2})$`);

/**
 * The reason a cancellation was written with, without the standard prefix.
 * `reverseTransaction` writes `Bekor qilindi: <reason>`, or the row's uuid
 * when no reason was given — nothing a reader can use. Some reasons are
 * reworded here, because the rows themselves are never rewritten: two early
 * writers left English text, and the monthly switch's «migratsiyasi — 2026-09»
 * did not say what happened to the money (CEO, 06.10.2026).
 */
export function reversalReason(description: string | null): string | null {
  const text = description?.trim();
  if (!text || /^Bekor qilindi \([0-9a-f-]+\)$/i.test(text)) return null;
  const reason = text.startsWith(PREFIX)
    ? text.slice(PREFIX.length).trim()
    : text;
  if (reason === 'attendance status changed') return "Davomat holati o'zgardi";
  if (reason.startsWith('Backfill reversal')) return null;
  const migration = MIGRATION_MONTH.exec(reason);
  if (migration) {
    const month = uzMonthName(Number(migration[1]));
    return `Oylik to'lovga o'tildi, bu dars puli ${month} oylik to'loviga kirdi`;
  }
  return reason || null;
}

export function reversalView(row: ReversalFields): ReversalView | null {
  if (row.reversedTransaction) {
    return {
      kind: 'undo',
      originalAt: row.reversedTransaction.createdAt,
      originalAmount: row.reversedTransaction.amount,
      reason: reversalReason(row.description),
    };
  }
  if (row.reversedAt) {
    const undo = row.reversalEntries[0];
    return {
      kind: 'reversed',
      at: undo?.createdAt ?? row.reversedAt,
      reason: undo ? reversalReason(undo.description) : null,
    };
  }
  return null;
}

/** A selected row with the relation fields replaced by `reversal`. */
export function withReversal<T extends ReversalFields>(
  row: T,
): Omit<T, 'reversedAt' | 'reversedTransaction' | 'reversalEntries'> & {
  reversal: ReversalView | null;
} {
  const { reversedAt, reversedTransaction, reversalEntries, ...rest } = row;
  return {
    ...rest,
    reversal: reversalView({
      description: row.description,
      reversedAt,
      reversedTransaction,
      reversalEntries,
    }),
  };
}
