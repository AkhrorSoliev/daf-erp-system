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
 * Shared by the activity report and the departures loader, so both read one
 * enrollment's status by the same rule. Both also give each log its missing
 * opening row first (`supplyOpeningRow`), so an enrollment opened before the
 * log existed reads ACTIVE from its creation in both. Their inputs still
 * differ, so they can disagree about the same student: the loader also
 * completes a log that never recorded the closing (`supplyClosingRow`, from
 * the row itself) and closes the enrollments of a deleted group at the
 * deletion, while the activity report reads the log of live groups only.
 * The teacher-change departures reader completes its logs the same way.
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

/**
 * Gives an enrollment's log its missing opening row, in place (`log` is
 * ascending by `transitionAt`).
 *
 * An enrollment opens ACTIVE, and every writer logs that row at its
 * `createdAt`. An enrollment opened before the log existed (up to
 * 2026-04-26) can have only its later rows, so a log that starts with
 * another status later than the creation gets its opening row back. A first
 * row at the creation itself was the opening, so none is added. An empty log
 * is left alone: `enrollmentStatusOn` reads such an enrollment from its own
 * columns.
 */
export function supplyOpeningRow(
  log: EnrollmentStatusEvent[],
  createdAt: Date,
): void {
  const first = log[0];
  if (
    first &&
    first.status !== 'ACTIVE' &&
    createdAt.getTime() < first.transitionAt.getTime()
  ) {
    log.unshift({ status: 'ACTIVE', transitionAt: createdAt });
  }
}

/**
 * Gives an enrollment's log its missing closing row, in place (`log` is
 * ascending by `transitionAt`).
 *
 * Older writers could change an enrollment's status without logging it; the
 * row still says how (`status`) and when (`statusChangedAt`), so the log is
 * completed from it — unless the log already ends with that status, or has a
 * row later than that moment (then the row's moment cannot be placed). An
 * empty log is left alone, as in `supplyOpeningRow`.
 */
export function supplyClosingRow(
  log: EnrollmentStatusEvent[],
  row: { status: string; statusChangedAt: Date | null },
): void {
  const last = log[log.length - 1];
  if (
    last &&
    row.statusChangedAt &&
    last.status !== row.status &&
    row.statusChangedAt.getTime() >= last.transitionAt.getTime()
  ) {
    log.push({ status: row.status, transitionAt: row.statusChangedAt });
  }
}
