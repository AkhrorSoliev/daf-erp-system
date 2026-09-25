/**
 * The status an enrollment had at a given instant — the one implementation.
 *
 * Source: `EnrollmentStateLog` rows, ascending by `transitionAt`. A legacy
 * enrollment with no log rows falls back to its own columns: ACTIVE from
 * `createdAt`, then its current status from `statusChangedAt`. A closed
 * enrollment that never recorded `statusChangedAt` therefore reads as ACTIVE
 * forever; that is the activity report's long-standing behaviour and is kept
 * here, not changed.
 *
 * Shared by the activity report and the departures loader so the two cannot
 * disagree about who was in a group on a given day.
 */
export interface EnrollmentStatusEvent {
  status: string;
  transitionAt: Date;
}

export interface EnrollmentStatusFallback {
  createdAt: Date;
  statusChangedAt: Date | null;
  status: string;
}

export function enrollmentStatusOn(
  events: readonly EnrollmentStatusEvent[] | undefined,
  date: Date,
  fallback: EnrollmentStatusFallback,
): string | null {
  if (events && events.length > 0) {
    let last: string | null = null;
    for (const e of events) {
      if (e.transitionAt.getTime() <= date.getTime()) last = e.status;
      else break;
    }
    return last;
  }
  if (fallback.createdAt.getTime() > date.getTime()) return null;
  if (
    fallback.status !== 'ACTIVE' &&
    fallback.statusChangedAt &&
    fallback.statusChangedAt.getTime() <= date.getTime()
  ) {
    return fallback.status;
  }
  return 'ACTIVE';
}
