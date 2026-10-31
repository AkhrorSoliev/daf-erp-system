import type { Prisma } from '@prisma/client';
import { EntityAction, MonthlyChargeStatus } from '@prisma/client';
import type { TransactionsWriteService } from '../transactions/transactions-write.service';
import { applyDiscount } from './monthly-price';
import {
  unusedDepartureLessons,
  type UnusedLessonDay,
} from './unused-departure-lessons';

export interface WriteOffUnusedDays {
  enrollmentId: string;
  /** "YYYY-MM-DD" */
  date: string;
}

export interface WriteOffUnusedResult {
  days: number;
  amount: number;
}

/**
 * CEO's «Foydalanilmagan darslar qarzini bekor qilish» (spec
 * 2026-10-31): writes off the days the CEO picked from
 * `unusedDepartureLessons`. Never trusts the client's amount — recomputes
 * the candidate list fresh and keeps only the requested days that are still
 * in it (a day a later read already resolved, e.g. a race with another
 * write, is silently dropped rather than refused).
 *
 * Two caps, same as `cancelledLessonRelease` (ADR-0053) generalised to many
 * days: per charge, capped at what it still holds; and — new here — a
 * running debt budget across every charge, read live, so the total can
 * never turn the balance positive. Charges are processed oldest period
 * first, so earlier debt is forgiven before later debt when the two don't
 * divide evenly. A day whose charge-level cap or whose slice of the debt
 * budget comes up short is still marked resolved (`frozenOutDates`) even
 * though its money is capped — the same thing `cancelledLessonRelease` does
 * for one day; here it can span several.
 */
export async function writeOffUnusedDepartureLessons(
  tx: Prisma.TransactionClient,
  transactionsWrite: TransactionsWriteService,
  params: {
    studentId: number;
    companyId: number;
    requested: readonly WriteOffUnusedDays[];
    reason?: string;
    performedById: number;
  },
): Promise<WriteOffUnusedResult> {
  if (params.requested.length === 0) return { days: 0, amount: 0 };

  const candidates = await unusedDepartureLessons(tx, params.studentId);
  const requestedKeys = new Set(
    params.requested.map((r) => `${r.enrollmentId}:${r.date}`),
  );
  const selected = candidates.filter((c) =>
    requestedKeys.has(`${c.enrollmentId}:${c.date}`),
  );
  if (selected.length === 0) return { days: 0, amount: 0 };

  const student = await tx.student.findFirst({
    where: { id: params.studentId, companyId: params.companyId },
    select: { balance: true },
  });
  if (!student) return { days: 0, amount: 0 };
  let debtBudget = Math.max(0, -student.balance);

  const byCharge = new Map<string, UnusedLessonDay[]>();
  for (const day of selected) {
    const period = day.date.slice(0, 7);
    const key = `${day.enrollmentId}:${period}`;
    const list = byCharge.get(key) ?? [];
    list.push(day);
    byCharge.set(key, list);
  }
  const chargeKeys = [...byCharge.keys()].sort();

  let totalDays = 0;
  let totalAmount = 0;
  for (const key of chargeKeys) {
    const [enrollmentId, period] = key.split(':');
    const [periodYear, periodMonth] = period.split('-').map(Number);
    const charge = await tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId,
          periodYear,
          periodMonth,
        },
      },
      select: {
        id: true,
        studentId: true,
        branchId: true,
        coveredDates: true,
        frozenOutDates: true,
        perLessonCost: true,
        discountPercent: true,
        chargedAmount: true,
        status: true,
      },
    });
    if (!charge || charge.status !== MonthlyChargeStatus.CHARGED) continue;
    const already = new Set(charge.frozenOutDates);
    const dates = byCharge
      .get(key)!
      .map((d) => d.date)
      .filter((d) => charge.coveredDates.includes(d) && !already.has(d));
    if (dates.length === 0) continue;

    const perLesson = applyDiscount(
      charge.perLessonCost,
      charge.discountPercent,
    );
    const chargeCap = Math.min(dates.length * perLesson, charge.chargedAmount);
    const amount = Math.min(chargeCap, debtBudget);
    if (amount <= 0) continue;
    debtBudget -= amount;

    const frozenOutAfter = [...already, ...dates].sort();
    const dayLabel =
      dates.length === 1
        ? `${dates[0].slice(8, 10)}.${dates[0].slice(5, 7)}`
        : `${dates.length} ta`;
    await transactionsWrite.createAdjustment(
      {
        studentId: params.studentId,
        amount,
        companyId: params.companyId,
        branchId: charge.branchId,
        description:
          `Foydalanilmagan darslar qarzi bekor qilindi — ${dayLabel} ` +
          `${params.reason ? `(${params.reason})` : ''}`.trim(),
        performedById: params.performedById,
        actor: { kind: 'user', id: params.performedById },
        metadata: {
          kind: 'unused-departure-release',
          enrollmentId,
          period,
          dates,
          ...(params.reason ? { reason: params.reason } : {}),
        },
      },
      tx,
    );
    await tx.enrollmentMonthlyCharge.update({
      where: { id: charge.id },
      data: {
        coveredLessons: charge.coveredDates.length - frozenOutAfter.length,
        chargedAmount: charge.chargedAmount - amount,
        frozenOutDates: frozenOutAfter,
      },
    });
    totalDays += dates.length;
    totalAmount += amount;
    if (debtBudget <= 0) break;
  }

  if (totalDays > 0) {
    await tx.entityHistory.create({
      data: {
        entityType: 'Student',
        entityId: String(params.studentId),
        action: EntityAction.UPDATE,
        newValues: {
          action: 'FOYDALANILMAGAN_DARSLAR_BEKOR_QILINDI',
          kunlar: totalDays,
          summa: totalAmount,
          ...(params.reason ? { sabab: params.reason } : {}),
        },
        changedById: params.performedById,
        companyId: params.companyId,
      },
    });
  }

  return { days: totalDays, amount: totalAmount };
}
