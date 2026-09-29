import { Prisma } from '@prisma/client';
import { replayDebtOrigin } from '../../common/finance/debt-origin';

/**
 * How much of each teacher's "students paid" pay the students have NOT paid
 * yet — on the monthly billing model (ADR-0052).
 *
 * A monthly course bills the whole month when the month starts, whether or not
 * the student can pay: the charge is written and the balance goes negative.
 * The lesson then counts as billed, the teacher's accrual is written as
 * student-covered, and the salary report put all of it under «O'quvchilar
 * to'lagan». On the 12-lesson model a debtor's lesson had no accrual and the
 * centre's top-up showed it; on the monthly model that share vanished into the
 * students' column (September 2026: ≈15.6 mln so'm, top-up column 79 800).
 *
 * The share is read off the charge itself. A student's balance settles the
 * oldest charge first (`replayDebtOrigin`), so what is still unpaid of THIS
 * month's charge is known exactly; each accrual that charge backs moves the
 * same fraction to the centre's column. It is a live figure: it shrinks as the
 * student pays. Pay itself does not change — this only splits it.
 */

export interface ShareAccrual {
  userId: number;
  studentId: number;
  amount: number;
  wasCenterTopUp: boolean;
  deductionTransactionId: string | null;
}

/**
 * Pure: teacher id → pay on the unpaid part of the charges behind their
 * accruals. `leftById` / `chargedById` are keyed by charge transaction id;
 * a charge absent from `leftById` is fully paid.
 */
export function unpaidShareByTeacher(
  accruals: ShareAccrual[],
  leftById: Map<string, number>,
  chargedById: Map<string, number>,
): Map<number, number> {
  const raw = new Map<number, number>();
  for (const a of accruals) {
    if (a.wasCenterTopUp || !a.deductionTransactionId) continue;
    const left = leftById.get(a.deductionTransactionId) ?? 0;
    const charged = chargedById.get(a.deductionTransactionId) ?? 0;
    if (left <= 0 || charged <= 0) continue;
    const share = a.amount * Math.min(1, left / charged);
    raw.set(a.userId, (raw.get(a.userId) ?? 0) + share);
  }
  const out = new Map<number, number>();
  for (const [id, v] of raw) out.set(id, Math.round(v));
  return out;
}

export async function loadUnpaidMonthlyShare(
  prisma: Pick<
    Prisma.TransactionClient,
    'enrollmentMonthlyCharge' | 'student' | 'transaction'
  >,
  companyId: number,
  accruals: ShareAccrual[],
): Promise<Map<number, number>> {
  const backed = accruals.filter(
    (a) => !a.wasCenterTopUp && a.deductionTransactionId,
  );
  const txIds = [...new Set(backed.map((a) => a.deductionTransactionId!))];
  if (txIds.length === 0) return new Map();

  // Only accruals a MONTHLY charge backs. A pack deduction is money the
  // student had already put down, so its lessons are genuinely covered.
  const charges = await prisma.enrollmentMonthlyCharge.findMany({
    where: { companyId, transactionId: { in: txIds } },
    select: { transactionId: true },
  });
  const monthlyTx = new Set(charges.map((c) => c.transactionId as string));
  const monthly = backed.filter((a) =>
    monthlyTx.has(a.deductionTransactionId!),
  );
  if (monthly.length === 0) return new Map();

  // Only a student in debt today can have an unpaid charge.
  const debtors = await prisma.student.findMany({
    where: {
      companyId,
      id: { in: [...new Set(monthly.map((a) => a.studentId))] },
      balance: { lt: 0 },
    },
    select: { id: true },
  });
  if (debtors.length === 0) return new Map();

  // The same rows and order `DebtAgeService` replays: every balance-moving
  // row, reversals included (their counter-rows net them out).
  const rows = await prisma.transaction.findMany({
    where: {
      companyId,
      studentId: { in: debtors.map((d) => d.id) },
      amount: { not: 0 },
    },
    select: {
      id: true,
      studentId: true,
      type: true,
      amount: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const perStudent = new Map<number, typeof rows>();
  const chargedById = new Map<string, number>();
  for (const r of rows) {
    if (r.studentId == null) continue;
    const list = perStudent.get(r.studentId);
    if (list) list.push(r);
    else perStudent.set(r.studentId, [r]);
    if (monthlyTx.has(r.id)) chargedById.set(r.id, -r.amount);
  }
  const leftById = new Map<string, number>();
  for (const list of perStudent.values()) {
    for (const [id, left] of replayDebtOrigin(list).leftById) {
      if (monthlyTx.has(id)) leftById.set(id, left);
    }
  }
  return unpaidShareByTeacher(monthly, leftById, chargedById);
}
