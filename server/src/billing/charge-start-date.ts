import { addDaysToDateStr, tashkentDateStr } from '../common/date/tashkent';

/**
 * The first day a monthly charge may cover for one enrollment, as a Tashkent
 * `YYYY-MM-DD`.
 *
 * - The enrollment's `startDate` when it has one. The admin flow always
 *   writes it, and Telegram sign-up does since 26.09.2026.
 * - Otherwise the day the enrollment was created. A missing start used to
 *   read as "from the 1st of the month": Telegram sign-up wrote none, so
 *   everyone who joined a group through it mid-month was billed the whole
 *   month (107 students in September 2026, caught before the switch to
 *   monthly billing). The rest of the system already reads a missing start
 *   this way — the absence-streak window is `startDate ?? createdAt`.
 * - Never before the group's own start: a student added a few days before
 *   the group opens cannot attend the lessons it has not held yet.
 * - Never on or before the day the enrollment came back from a freeze. A
 *   student frozen when a month's charge run went by has no charge for that
 *   month, so the charge made after their return would otherwise reach back
 *   to the join date and bill the frozen weeks too. The return day itself
 *   stays free — the rule `MonthlyChargeService.restoreChargeForReturn`
 *   applies when the month already has a charge.
 */
export function chargeStartDate(enrollment: {
  startDate: Date | null;
  createdAt: Date;
  /** When the enrollment last came back to ACTIVE; null if it never left. */
  returnedAt: Date | null;
  group: { startDate: Date | null };
}): string {
  const own = tashkentDateStr(enrollment.startDate ?? enrollment.createdAt);
  const groupStart = enrollment.group.startDate
    ? tashkentDateStr(enrollment.group.startDate)
    : null;
  const afterReturn = enrollment.returnedAt
    ? addDaysToDateStr(tashkentDateStr(enrollment.returnedAt), 1)
    : null;
  return [groupStart, afterReturn].reduce<string>(
    (latest, day) => (day !== null && day > latest ? day : latest),
    own,
  );
}
