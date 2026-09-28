import type { Prisma } from '@prisma/client';

/**
 * ADR-0049: the centre covers a student's first lesson of the month for the
 * teacher when the student came and has not paid for it. The accrual itself
 * is written as usual (same amount, same teacher); this only records who
 * funded it, with the flags the salary report and the X/Y/Z recovery card
 * already read:
 *
 * - `fronted: true` — the centre pays it: `isCenterTopUp` and the sticky
 *   `wasCenterTopUp` are set.
 * - `fronted: false` — the student's payment has reached it: `isCenterTopUp`
 *   is cleared on rows the centre did front; `wasCenterTopUp` stays, so the
 *   month keeps showing what the centre advanced.
 *
 * Money does not move: no amount, ledger row or balance is touched.
 */
export async function setFirstLessonFunder(
  tx: Pick<Prisma.TransactionClient, 'salaryAccrual'>,
  attendanceId: string,
  fronted: boolean,
): Promise<number> {
  const { count } = await tx.salaryAccrual.updateMany({
    where: fronted
      ? { attendanceId, reversedAt: null, isCenterTopUp: false }
      : {
          attendanceId,
          reversedAt: null,
          isCenterTopUp: true,
          wasCenterTopUp: true,
        },
    data: fronted
      ? { isCenterTopUp: true, wasCenterTopUp: true }
      : { isCenterTopUp: false },
  });
  return count;
}
