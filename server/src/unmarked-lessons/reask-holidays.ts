import type { PrismaClient } from '@prisma/client';
import {
  addDaysToDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
} from '../common/date/tashkent';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';

/**
 * How far ahead the holidays are read for a re-asked task's due date. A
 * holiday spans at most 60 days (HolidaysService), so 90 days always reaches a
 * working day past the longest one.
 */
const HOLIDAY_LOOKAHEAD_DAYS = 90;

/**
 * The holidays a re-asked «Dars bo'ldimi?» task must skip when it sets its due
 * date (`reopenAfterCancellationRemoved`, `reopenAfterRescheduleRemoved`).
 * Read for the GROUP's branch, from today on. Call it before the transaction
 * opens: a Serializable transaction should not wait on a holiday lookup. A
 * group that is gone leaves the branch open (every branch's holidays) — the
 * reopen then skips it anyway.
 *
 * Not `HolidaysService`: importing it here closes the billing import cycle
 * that `holidays/holiday-date-set.ts` exists to avoid.
 */
export async function loadReaskHolidays(
  prisma: Pick<PrismaClient, 'group' | 'holiday'>,
  groupId: string,
  now: Date,
): Promise<Set<string>> {
  const today = tashkentDateStr(now);
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { branchId: true },
  });
  return buildHolidayDateSet(
    prisma,
    tashkentDayStartUtc(today),
    tashkentDayStartUtc(addDaysToDateStr(today, HOLIDAY_LOOKAHEAD_DAYS)),
    group?.branchId,
  );
}
