/**
 * What "a departed student" means — the one definition (ADR-0035).
 *
 * Expulsion counts on the day. Leaving the last group and being frozen count
 * on the day they happened, unless the student is back within the grace
 * period of that kind of stop (`DEPARTURE_GRACE_DAYS`); then there was no
 * departure. Stops before a return belong to one episode, dated by the first
 * and named by the strongest. Archiving is not a stop: an archived card is
 * an error or a duplicate record, and the loader leaves it out like a
 * deleted one.
 *
 * This file only turns events into episodes and reads nothing:
 * `reports/shared/departures.loader.ts` decides which records are a stop or
 * a return and collects them from the logs. The report page and the home
 * card both read the episodes through that loader; do not restate the rule
 * anywhere else.
 */

export type StopKind = 'EXPELLED' | 'FROZEN' | 'LEFT_GROUP';

export type GraceDays = Record<Exclude<StopKind, 'EXPELLED'>, number>;

/** Days a stop waits for a return before it counts as a departure (ADR-0035). */
export const DEPARTURE_GRACE_DAYS: GraceDays = { LEFT_GROUP: 21, FROZEN: 60 };

const DAY_MS = 24 * 60 * 60 * 1000;

export type StudentEvent =
  | { studentId: number; at: Date; type: 'STOP'; kind: StopKind }
  | { studentId: number; at: Date; type: 'RETURN' };

type StopEvent = Extract<StudentEvent, { type: 'STOP' }>;

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

/** An expulsion does not wait for a return. */
function isImmediate(kind: StopKind): kind is 'EXPELLED' {
  return kind === 'EXPELLED';
}

/** When one episode holds several stops, the heaviest names it. */
const WEIGHT: Record<StopKind, number> = {
  LEFT_GROUP: 1,
  FROZEN: 2,
  EXPELLED: 3,
};

interface OpenEpisode {
  studentId: number;
  startedAt: Date;
  stopKind: StopKind;
  /** The heaviest stop that waits; its grace period runs from `startedAt`. */
  waitingKind: keyof GraceDays | null;
  /** Set once, at the grace end or the first expulsion, whichever is first. */
  confirmedAt: Date | null;
}

export function buildDepartureEpisodes(
  events: readonly StudentEvent[],
  opts: { graceDays: GraceDays; now: Date },
): DepartureEpisode[] {
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
      if (open) confirmAtGraceEnd(open, ev.at, opts.graceDays);
      if (ev.type === 'STOP') {
        if (open) join(open, ev);
        else open = start(ev);
        continue;
      }
      if (!open) continue; // joining a first group opens nothing
      // Back before the confirmation: there was no departure.
      if (open.confirmedAt) episodes.push(episodeOf(open, ev.at));
      open = null;
    }
    if (open) {
      confirmAtGraceEnd(open, opts.now, opts.graceDays);
      episodes.push(episodeOf(open, null));
    }
  }
  return episodes;
}

function start(stop: StopEvent): OpenEpisode {
  return {
    studentId: stop.studentId,
    startedAt: stop.at,
    stopKind: stop.kind,
    waitingKind: isImmediate(stop.kind) ? null : stop.kind,
    confirmedAt: isImmediate(stop.kind) ? stop.at : null,
  };
}

/**
 * A later stop before a return joins the open episode and can make its name
 * heavier. Before the episode is confirmed, an expulsion confirms it and a
 * heavier waiting stop gives it that stop's grace period; once confirmed, it
 * keeps its `confirmedAt`.
 */
function join(open: OpenEpisode, stop: StopEvent): void {
  if (WEIGHT[stop.kind] > WEIGHT[open.stopKind]) open.stopKind = stop.kind;
  if (open.confirmedAt) return;
  if (isImmediate(stop.kind)) {
    open.confirmedAt = stop.at;
  } else if (
    !open.waitingKind ||
    WEIGHT[stop.kind] > WEIGHT[open.waitingKind]
  ) {
    open.waitingKind = stop.kind;
  }
}

/**
 * Confirms the episode at its grace end once `t` has reached it: nothing
 * before `t` brought the student back. A return exactly at the grace end
 * comes after it.
 */
function confirmAtGraceEnd(
  open: OpenEpisode,
  t: Date,
  graceDays: GraceDays,
): void {
  if (open.confirmedAt || !open.waitingKind) return;
  const end = open.startedAt.getTime() + graceDays[open.waitingKind] * DAY_MS;
  if (t.getTime() >= end) open.confirmedAt = new Date(end);
}

function episodeOf(
  open: OpenEpisode,
  returnedAt: Date | null,
): DepartureEpisode {
  return {
    studentId: open.studentId,
    startedAt: open.startedAt,
    stopKind: open.stopKind,
    state: open.confirmedAt ? 'confirmed' : 'pending',
    confirmedAt: open.confirmedAt,
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
