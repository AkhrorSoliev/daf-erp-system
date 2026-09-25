import { tashkentDateStr } from '../common/date/tashkent';

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
 */
export function chargeStartDate(enrollment: {
  startDate: Date | null;
  createdAt: Date;
  group: { startDate: Date | null };
}): string {
  const own = tashkentDateStr(enrollment.startDate ?? enrollment.createdAt);
  const groupStart = enrollment.group.startDate
    ? tashkentDateStr(enrollment.group.startDate)
    : null;
  return groupStart !== null && groupStart > own ? groupStart : own;
}
