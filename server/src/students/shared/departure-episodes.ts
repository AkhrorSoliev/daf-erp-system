/**
 * What "a departed student" means — the one definition (ADR-0035).
 *
 * Expulsion and archiving count on the day. Leaving the last group and being
 * frozen count on the day they happened, unless the student is back within
 * the grace period; then there was no departure. Stops before a return belong
 * to one episode, dated by the first and named by the strongest.
 *
 * This file only turns events into episodes and reads nothing:
 * `reports/shared/departures.loader.ts` collects the events from the logs.
 * The report, the home card and the Excel KPI sheet all read this function;
 * do not restate the rule anywhere else.
 */

export const DEPARTURE_GRACE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type StopKind = 'EXPELLED' | 'ARCHIVED' | 'FROZEN' | 'LEFT_GROUP';

export type StudentEvent =
  | { studentId: number; at: Date; type: 'STOP'; kind: StopKind }
  | { studentId: number; at: Date; type: 'RETURN' };

export interface DepartureEpisode {
  studentId: number;
  /** The first stop — the departure date. */
  startedAt: Date;
  /** The strongest stop in the episode. */
  stopKind: StopKind;
  state: 'pending' | 'confirmed';
  confirmedAt: Date | null;
  returnedAt: Date | null;
}

/** These do not wait for the grace period. */
const IMMEDIATE: ReadonlySet<StopKind> = new Set(['EXPELLED', 'ARCHIVED']);

/** When one episode holds several stops, the heaviest names it. */
const WEIGHT: Record<StopKind, number> = {
  LEFT_GROUP: 1,
  FROZEN: 2,
  EXPELLED: 3,
  ARCHIVED: 4,
};

interface OpenEpisode {
  studentId: number;
  startedAt: Date;
  stopKind: StopKind;
  immediateAt: Date | null;
}

export function buildDepartureEpisodes(
  events: readonly StudentEvent[],
  opts: { graceDays: number; now: Date },
): DepartureEpisode[] {
  const graceMs = opts.graceDays * DAY_MS;
  const byStudent = new Map<number, StudentEvent[]>();
  for (const e of events) {
    const list = byStudent.get(e.studentId);
    if (list) list.push(e);
    else byStudent.set(e.studentId, [e]);
  }

  const episodes: DepartureEpisode[] = [];
  for (const list of byStudent.values()) {
    // At one instant a stop sorts before a return, so the return closes it.
    const sorted = [...list].sort(
      (a, b) =>
        a.at.getTime() - b.at.getTime() ||
        (a.type === b.type ? 0 : a.type === 'STOP' ? -1 : 1),
    );
    let open: OpenEpisode | null = null;
    for (const ev of sorted) {
      if (ev.type === 'STOP') {
        if (!open) {
          open = {
            studentId: ev.studentId,
            startedAt: ev.at,
            stopKind: ev.kind,
            immediateAt: IMMEDIATE.has(ev.kind) ? ev.at : null,
          };
        } else {
          if (WEIGHT[ev.kind] > WEIGHT[open.stopKind]) open.stopKind = ev.kind;
          if (!open.immediateAt && IMMEDIATE.has(ev.kind)) {
            open.immediateAt = ev.at;
          }
        }
        continue;
      }
      if (!open) continue; // joining a first group opens nothing
      const graceEnd = new Date(open.startedAt.getTime() + graceMs);
      if (open.immediateAt) {
        episodes.push(closed(open, open.immediateAt, ev.at));
      } else if (ev.at.getTime() >= graceEnd.getTime()) {
        episodes.push(closed(open, graceEnd, ev.at));
      }
      // Otherwise the student came back in time: no departure.
      open = null;
    }
    if (open) {
      const graceEnd = new Date(open.startedAt.getTime() + graceMs);
      const confirmedAt =
        open.immediateAt ??
        (opts.now.getTime() >= graceEnd.getTime() ? graceEnd : null);
      episodes.push({
        studentId: open.studentId,
        startedAt: open.startedAt,
        stopKind: open.stopKind,
        state: confirmedAt ? 'confirmed' : 'pending',
        confirmedAt,
        returnedAt: null,
      });
    }
  }
  return episodes;
}

function closed(
  open: OpenEpisode,
  confirmedAt: Date,
  returnedAt: Date,
): DepartureEpisode {
  return {
    studentId: open.studentId,
    startedAt: open.startedAt,
    stopKind: open.stopKind,
    state: 'confirmed',
    confirmedAt,
    returnedAt,
  };
}

/**
 * Confirmed departures that started in `[gte, lt)` and not before the
 * reporting floor (ADR-0005). One per student — the earliest.
 */
export function departuresInRange(
  episodes: readonly DepartureEpisode[],
  range: { gte: Date; lt: Date },
  floor: Date | null,
): DepartureEpisode[] {
  const first = new Map<number, DepartureEpisode>();
  for (const e of episodes) {
    if (e.state !== 'confirmed' || !startedIn(e, range, floor)) continue;
    const seen = first.get(e.studentId);
    if (!seen || e.startedAt.getTime() < seen.startedAt.getTime()) {
      first.set(e.studentId, e);
    }
  }
  return [...first.values()];
}

/**
 * Pending episodes that started in `[gte, lt)` and not before the reporting
 * floor: the stops of that period that still count if the student does not
 * come back in time. A pending episode is always the student's open one, so
 * there is at most one per student.
 */
export function pendingInRange(
  episodes: readonly DepartureEpisode[],
  range: { gte: Date; lt: Date },
  floor: Date | null,
): DepartureEpisode[] {
  return episodes.filter(
    (e) => e.state === 'pending' && startedIn(e, range, floor),
  );
}

function startedIn(
  episode: DepartureEpisode,
  range: { gte: Date; lt: Date },
  floor: Date | null,
): boolean {
  const t = episode.startedAt.getTime();
  const from = Math.max(range.gte.getTime(), floor?.getTime() ?? -Infinity);
  return t >= from && t < range.lt.getTime();
}

/** Episodes the student has not come back from; at most one per student. */
export function openEpisodes(
  episodes: readonly DepartureEpisode[],
): DepartureEpisode[] {
  return episodes.filter((e) => e.returnedAt === null);
}
