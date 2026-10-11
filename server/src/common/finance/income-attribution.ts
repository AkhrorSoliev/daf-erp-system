import { TransactionType } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { tashkentMonthKey } from '../date/tashkent';
import type { ResolvedPeriod } from './period-helpers';
import { branchIdWhere, type ReportBranchIds } from './report-branch-scope';

/**
 * Income composition for a period: how the cash received in [start, end]
 * splits into money for the period's OWN month(s), money paid AHEAD for the
 * next month, and LATE payments that settled debt carried in from earlier
 * months — broken down by WHICH earlier month (ADR-0067). It is the
 * «Qayerdan keldi» dialog on /payments/overview and the income lines of the
 * 21:00 report and «💰 Moliyaviy xulosa».
 *
 * Definition (balance/debt-based FIFO, chosen by the CEO): a payment is
 * "late" only to the extent it reduced a NEGATIVE student balance at the
 * instant it landed. The debt it cleared is aged OLDEST-FIRST across the
 * months in which those debit rows actually hit the balance (their
 * `createdAt` Tashkent month). Whatever a tallied payment does beyond
 * clearing a pre-period debt is the period's own money, in one of two parts:
 *  - `currentMonth` — it settled a charge of the period: a debt of the
 *    period's months, or, standing on the balance, a debit dated INSIDE the
 *    period spent it (a mid-month join);
 *  - `advance` — it still stands on the balance at the period end, or a
 *    debit AFTER the period end spent it (the next month's charge on the
 *    1st, when a closed month is viewed later).
 *
 * Reconstructed from the append-only ledger by replaying each payer's
 * EFFECTIVE ledger: rows still in force (`reversedAt IS NULL AND
 * reversedTransactionId IS NULL`). A reversed row and its reversal net to
 * zero, so dropping both keeps the running balance exactly equal to
 * `Student.balance` (same invariant `getReconciliation` relies on). Two FIFO
 * queues per student: unsettled debit fragments, each tagged by its Tashkent
 * month, and standing credit fragments, each marked in scope or not (in
 * scope = the leftover of a COMPLETED PAYMENT inside the period and branch).
 * A credit consumes the debt queue oldest first; a debit consumes the credit
 * queue oldest first — so an older out-of-scope credit (an earlier payment,
 * an adjustment, an initial balance) is spent before this period's advance.
 * A tallied payment's FULL amount lands in exactly one of the three parts,
 * and moving advance into `currentMonth` keeps the sum, so `total =
 * currentMonth + advance + lateTotal` is exactly the period's tallied
 * payments (the Tushumlar figure).
 *
 * Debt aging is company-wide (a student's balance isn't cleanly
 * branch-scoped, same stance as `getMonthlyDebtRecovery`), but the TALLIED
 * payments honor `branchId` so the total still reconciles with a
 * branch-filtered card in the common (single-branch-per-student) case.
 *
 * It also returns each tallied payment's own parts (`byPayment`), so the
 * To'lovlar page's rows add up to the card (spec B4 §4.4).
 */

export interface AttributionRow {
  studentId: number | null;
  type: TransactionType;
  amount: number;
  branchId: number | null;
  createdAt: Date;
  paymentId: string | null;
}

export interface PaymentParts {
  currentMonth: number;
  advance: number;
  /** Newest month first. */
  late: { monthKey: string; amount: number }[];
}

export interface IncomeAttribution {
  currentMonth: number;
  advance: number;
  advanceStudents: number;
  lateByMonth: Map<string, number>;
  paymentCount: number;
  latePaymentCount: number;
  lateStudentCount: number;
  byPayment: Map<string, PaymentParts>;
}

export async function loadAttributionRows(
  db: PrismaService,
  companyId: number,
  period: ResolvedPeriod,
  branchIds: ReportBranchIds,
): Promise<{ payerIds: number[]; rows: AttributionRow[] }> {
  // Only students who received a COMPLETED payment in the period+branch need
  // their ledger replayed — everyone else contributes nothing to this window.
  const payers = await db.payment.groupBy({
    by: ['studentId'],
    where: {
      companyId,
      status: 'COMPLETED',
      createdAt: { gte: period.start, lte: period.endTs },
      ...branchIdWhere(branchIds),
    },
  });
  const payerIds = payers
    .map((p) => p.studentId)
    .filter((id): id is number => id != null);
  if (payerIds.length === 0) return { payerIds, rows: [] };

  // Effective ledger for every payer, chronological. Reversed originals AND
  // their reversal rows are both excluded so the replay balance stays equal
  // to Student.balance. `id` is only a same-timestamp tiebreak.
  const rows: AttributionRow[] = await db.transaction.findMany({
    where: {
      companyId,
      studentId: { in: payerIds },
      reversedAt: null,
      reversedTransactionId: null,
    },
    select: {
      studentId: true,
      type: true,
      amount: true,
      branchId: true,
      createdAt: true,
      paymentId: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return { payerIds, rows };
}

export function attributeIncome(
  rows: readonly AttributionRow[],
  period: ResolvedPeriod,
  branchIds: ReportBranchIds,
): IncomeAttribution {
  const boundaryKey = tashkentMonthKey(period.start);
  const startMs = period.start.getTime();
  const endMs = period.endTs.getTime();

  // Bucket per student, preserving the chronological order of `rows`.
  const byStudent = new Map<number, AttributionRow[]>();
  for (const r of rows) {
    if (r.studentId == null) continue;
    const list = byStudent.get(r.studentId);
    if (list) list.push(r);
    else byStudent.set(r.studentId, [r]);
  }

  const lateByMonth = new Map<string, number>();
  const acc = new Map<
    string,
    { currentMonth: number; advance: number; late: Map<string, number> }
  >();
  const partsOf = (id: string) => {
    let p = acc.get(id);
    if (!p) {
      p = { currentMonth: 0, advance: 0, late: new Map() };
      acc.set(id, p);
    }
    return p;
  };
  let currentMonth = 0;
  let advance = 0;
  let advanceStudents = 0;
  let paymentCount = 0;
  let latePaymentCount = 0;
  const lateStudents = new Set<number>();

  for (const [studentId, list] of byStudent) {
    // Running ledger state per student:
    //  • `debts` — FIFO fragments of OUTSTANDING debt (oldest at `debtHead`).
    //  • `credits` — FIFO fragments of the standing POSITIVE balance (oldest
    //    at `creditHead`); `inScope` marks a tallied payment's leftover, and
    //    `paymentId` names the payment it belongs to (for `byPayment`).
    // Invariant after each row: standing credit ⟹ no outstanding debt, and
    // the debt fragments sum to max(0, -runningBalance). A debit the standing
    // balance covers never becomes a phantom obligation, so an on-time
    // prepaid payment (pay up front, the deduction follows) is never "late".
    const debts: Array<{ monthKey: string; remaining: number }> = [];
    let debtHead = 0;
    const credits: Array<{
      amount: number;
      inScope: boolean;
      paymentId: string | null;
    }> = [];
    let creditHead = 0;
    let studentAdvance = 0;

    for (const r of list) {
      if (r.amount === 0) continue; // LESSON_CONSUMPTION — no balance movement.
      const ts = r.createdAt.getTime();
      const inPeriod = ts >= startMs && ts <= endMs;

      if (r.amount < 0) {
        // A debit spends the standing balance oldest first; only the
        // uncovered remainder becomes an obligation tagged by its month.
        let debit = -r.amount;
        while (debit > 0 && creditHead < credits.length) {
          const frag = credits[creditHead];
          const taken = Math.min(debit, frag.amount);
          frag.amount -= taken;
          debit -= taken;
          // This period's advance spent on a debit of the period paid the
          // period (a mid-month join). Spent after the period end it paid
          // the next month, and it stays advance.
          if (frag.inScope && inPeriod) {
            studentAdvance -= taken;
            currentMonth += taken;
            if (frag.paymentId) {
              const p = partsOf(frag.paymentId);
              p.advance -= taken;
              p.currentMonth += taken;
            }
          }
          if (frag.amount === 0) creditHead++;
        }
        if (debit > 0) {
          debts.push({
            monthKey: tashkentMonthKey(r.createdAt),
            remaining: debit,
          });
        }
        continue;
      }

      // A credit settles the oldest outstanding obligations first. Only an
      // in-period, in-branch COMPLETED PAYMENT is tallied; every other credit
      // (out-of-period payment, positive adjustment, initial balance) still
      // consumes the queue so the debt aging stays correct.
      let credit = r.amount;
      const attribute =
        r.type === TransactionType.PAYMENT &&
        inPeriod &&
        // In-memory leg of the same scope: a credit from ANOTHER branch still
        // ages this student's debt, but is not this branch's income.
        (branchIds === null ||
          (r.branchId != null && branchIds.includes(r.branchId)));
      // A tallied PAYMENT row without `paymentId` counts in the totals only.
      const parts = attribute && r.paymentId ? partsOf(r.paymentId) : null;
      let settledOldDebt = false;

      while (credit > 0 && debtHead < debts.length) {
        const frag = debts[debtHead];
        const taken = Math.min(credit, frag.remaining);
        frag.remaining -= taken;
        credit -= taken;
        if (attribute) {
          if (frag.monthKey < boundaryKey) {
            lateByMonth.set(
              frag.monthKey,
              (lateByMonth.get(frag.monthKey) ?? 0) + taken,
            );
            if (parts) {
              parts.late.set(
                frag.monthKey,
                (parts.late.get(frag.monthKey) ?? 0) + taken,
              );
            }
            settledOldDebt = true;
          } else {
            currentMonth += taken;
            if (parts) parts.currentMonth += taken;
          }
        }
        if (frag.remaining === 0) debtHead++;
      }
      if (attribute) {
        paymentCount++;
        if (settledOldDebt) {
          latePaymentCount++;
          lateStudents.add(studentId);
        }
      }
      // Leftover credit beyond all outstanding debt stands on the balance and
      // absorbs FUTURE debits (else next month's deduction would look like a
      // phantom debt the following payment settles "late"). A tallied
      // payment's leftover is advance until a debit of the period spends it.
      if (credit > 0) {
        if (attribute) {
          studentAdvance += credit;
          if (parts) parts.advance += credit;
        }
        credits.push({
          amount: credit,
          inScope: attribute,
          paymentId: attribute ? r.paymentId : null,
        });
      }
    }
    advance += studentAdvance;
    if (studentAdvance > 0) advanceStudents++;
  }

  const byPayment = new Map<string, PaymentParts>();
  for (const [id, p] of acc) {
    byPayment.set(id, {
      currentMonth: p.currentMonth,
      advance: p.advance,
      late: [...p.late]
        .map(([monthKey, amount]) => ({ monthKey, amount }))
        .sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1)),
    });
  }

  return {
    currentMonth,
    advance,
    advanceStudents,
    lateByMonth,
    paymentCount,
    latePaymentCount,
    lateStudentCount: lateStudents.size,
    byPayment,
  };
}
