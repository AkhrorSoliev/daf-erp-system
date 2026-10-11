import {
  addDaysToDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
} from '../../common/date/tashkent';
import {
  enrollmentStatusOn,
  EnrollmentStatusEvent,
  supplyClosingRow,
  supplyOpeningRow,
} from '../../students/shared/enrollment-status-on';

/**
 * «Guruh» of a payment = the groups the student was in ON THE PAYMENT'S
 * TASHKENT DAY (spec B4 §4.5): an enrollment counts if it was ACTIVE at any
 * moment of that day. The log's two ends are filled like the departures loader
 * (`reports/shared/departures.loader.ts`), and a deleted group closes the
 * enrollment at `group.deletedAt`.
 */
export interface DayEnrollment {
  id: string;
  groupId: string;
  status: string;
  createdAt: Date;
  startDate: Date | null;
  statusChangedAt: Date | null;
  groupDeletedAt: Date | null;
  log: EnrollmentStatusEvent[];
}

export function activeOnDay(e: DayEnrollment, day: string): boolean {
  const dayStart = tashkentDayStartUtc(day);
  const dayEnd = tashkentDayStartUtc(addDaysToDateStr(day, 1));
  if (e.startDate && e.startDate.getTime() >= dayEnd.getTime()) return false;
  if (e.groupDeletedAt && e.groupDeletedAt.getTime() < dayStart.getTime())
    return false;
  const log = e.log.length
    ? e.log.map((x) => ({ ...x }))
    : [{ status: 'ACTIVE', transitionAt: e.createdAt }];
  supplyOpeningRow(log, e.createdAt);
  supplyClosingRow(log, e);
  if (enrollmentStatusOn(log, dayStart, e) === 'ACTIVE') return true;
  return log.some(
    (x) =>
      x.status === 'ACTIVE' &&
      x.transitionAt >= dayStart &&
      x.transitionAt < dayEnd,
  );
}

export function groupIdsOnDay(
  enrollments: readonly DayEnrollment[],
  paidAt: Date,
): string[] {
  const day = tashkentDateStr(paidAt);
  return [
    ...new Set(
      enrollments.filter((e) => activeOnDay(e, day)).map((e) => e.groupId),
    ),
  ];
}
