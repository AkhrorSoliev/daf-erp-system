import {
  buildDepartureEpisodes,
  DEPARTURE_GRACE_DAYS,
  departuresInRange,
  openEpisodes,
  pendingInRange,
  type DepartureEpisode,
  type GraceDays,
  type StopKind,
  type StudentEvent,
} from './departure-episodes';

const at = (s: string) => new Date(s);
const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE: GraceDays = { LEFT_GROUP: 21, FROZEN: 60 };
const NOW = at('2026-09-25T12:00:00Z');

const stop = (
  studentId: number,
  when: string,
  kind: StopKind,
): StudentEvent => ({
  studentId,
  at: at(when),
  type: 'STOP',
  kind,
});
const back = (studentId: number, when: string): StudentEvent => ({
  studentId,
  at: at(when),
  type: 'RETURN',
});
const build = (events: StudentEvent[], now = NOW) =>
  buildDepartureEpisodes(events, { graceDays: GRACE, now });

describe('DEPARTURE_GRACE_DAYS', () => {
  it('waits 21 days after leaving a group and 60 after a freeze', () => {
    expect(DEPARTURE_GRACE_DAYS).toEqual({ LEFT_GROUP: 21, FROZEN: 60 });
  });
});

describe('buildDepartureEpisodes', () => {
  it('counts an expulsion on its own day', () => {
    expect(build([stop(1, '2026-09-01T10:00:00Z', 'EXPELLED')])).toEqual([
      {
        studentId: 1,
        startedAt: at('2026-09-01T10:00:00Z'),
        stopKind: 'EXPELLED',
        state: 'confirmed',
        confirmedAt: at('2026-09-01T10:00:00Z'),
        returnedAt: null,
      },
    ]);
  });

  it('keeps a group leaver pending while the grace period runs', () => {
    expect(build([stop(1, '2026-09-20T10:00:00Z', 'LEFT_GROUP')])).toEqual([
      {
        studentId: 1,
        startedAt: at('2026-09-20T10:00:00Z'),
        stopKind: 'LEFT_GROUP',
        state: 'pending',
        confirmedAt: null,
        returnedAt: null,
      },
    ]);
  });

  it('confirms a group leaver who did not come back within the grace period', () => {
    const [episode] = build([stop(1, '2026-09-01T10:00:00Z', 'LEFT_GROUP')]);
    expect(episode.state).toBe('confirmed');
    expect(episode.confirmedAt).toEqual(at('2026-09-22T10:00:00Z'));
  });

  it('forgets a stop the student came back from within the grace period', () => {
    expect(
      build([
        stop(1, '2026-09-01T10:00:00Z', 'LEFT_GROUP'),
        back(1, '2026-09-04T10:00:00Z'),
      ]),
    ).toEqual([]);
  });

  it('treats a return exactly at the end of the grace period as a departure', () => {
    const [episode] = build([
      stop(1, '2026-07-01T10:00:00Z', 'FROZEN'),
      back(1, '2026-08-30T10:00:00Z'),
    ]);
    expect(episode.state).toBe('confirmed');
    expect(episode.confirmedAt).toEqual(at('2026-08-30T10:00:00Z'));
    expect(episode.returnedAt).toEqual(at('2026-08-30T10:00:00Z'));
  });

  it('forgets a freeze the student came back from one second before the end', () => {
    expect(
      build([
        stop(1, '2026-07-01T10:00:00Z', 'FROZEN'),
        back(1, '2026-08-30T09:59:59Z'),
      ]),
    ).toEqual([]);
  });

  it('merges stops before a return: dated by the first, named by the strongest', () => {
    expect(
      build([
        stop(1, '2026-09-01T10:00:00Z', 'LEFT_GROUP'),
        stop(1, '2026-09-05T10:00:00Z', 'EXPELLED'),
      ]),
    ).toEqual([
      {
        studentId: 1,
        startedAt: at('2026-09-01T10:00:00Z'),
        stopKind: 'EXPELLED',
        state: 'confirmed',
        confirmedAt: at('2026-09-05T10:00:00Z'),
        returnedAt: null,
      },
    ]);
  });

  it('confirms a pending episode the moment the student is expelled', () => {
    const [episode] = build([
      stop(1, '2026-09-20T10:00:00Z', 'LEFT_GROUP'),
      stop(1, '2026-09-22T10:00:00Z', 'EXPELLED'),
    ]);
    expect(episode.startedAt).toEqual(at('2026-09-20T10:00:00Z'));
    expect(episode.stopKind).toBe('EXPELLED');
    expect(episode.state).toBe('confirmed');
    expect(episode.confirmedAt).toEqual(at('2026-09-22T10:00:00Z'));
  });

  it('ignores joining a first group', () => {
    const episodes = build([
      back(1, '2026-03-01T10:00:00Z'),
      stop(1, '2026-06-01T10:00:00Z', 'LEFT_GROUP'),
    ]);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].startedAt).toEqual(at('2026-06-01T10:00:00Z'));
  });

  it('keeps every episode of a student who left twice', () => {
    const episodes = build([
      stop(1, '2026-05-01T10:00:00Z', 'LEFT_GROUP'),
      back(1, '2026-06-01T10:00:00Z'),
      stop(1, '2026-08-01T10:00:00Z', 'FROZEN'),
    ]);
    expect(
      episodes.map((e) => [
        e.startedAt.toISOString(),
        e.returnedAt?.toISOString() ?? null,
      ]),
    ).toEqual([
      ['2026-05-01T10:00:00.000Z', '2026-06-01T10:00:00.000Z'],
      ['2026-08-01T10:00:00.000Z', null],
    ]);
  });

  it('cancels a stop and a return logged at the same instant', () => {
    expect(
      build([
        back(1, '2026-09-01T10:00:00Z'),
        stop(1, '2026-09-01T10:00:00Z', 'LEFT_GROUP'),
      ]),
    ).toEqual([]);
  });

  it('counts an expulsion even when the student is re-admitted quickly', () => {
    const [episode] = build([
      stop(1, '2026-09-01T10:00:00Z', 'EXPELLED'),
      back(1, '2026-09-03T10:00:00Z'),
    ]);
    expect(episode.state).toBe('confirmed');
    expect(episode.confirmedAt).toEqual(at('2026-09-01T10:00:00Z'));
    expect(episode.returnedAt).toEqual(at('2026-09-03T10:00:00Z'));
  });

  it('builds each student independently', () => {
    const episodes = build([
      stop(1, '2026-09-01T10:00:00Z', 'LEFT_GROUP'),
      stop(2, '2026-09-02T10:00:00Z', 'EXPELLED'),
      back(1, '2026-09-03T10:00:00Z'),
    ]);
    expect(episodes.map((e) => e.studentId)).toEqual([2]);
  });
});

describe('buildDepartureEpisodes: the grace period of each kind of stop', () => {
  // Every episode starts at START; `day(d)` is d days after it.
  const START = '2026-06-01T10:00:00.000Z';
  const day = (d: number) =>
    new Date(at(START).getTime() + d * DAY_MS).toISOString();
  const confirmed = (
    stopKind: StopKind,
    confirmedAt: string,
    returnedAt: string | null,
  ): DepartureEpisode => ({
    studentId: 1,
    startedAt: at(START),
    stopKind,
    state: 'confirmed',
    confirmedAt: at(confirmedAt),
    returnedAt: returnedAt ? at(returnedAt) : null,
  });

  it('forgets leaving a group when the student is back on day 20', () => {
    expect(build([stop(1, START, 'LEFT_GROUP'), back(1, day(20))])).toEqual([]);
  });

  it('confirms leaving a group on day 21 when the student is back on day 22', () => {
    expect(build([stop(1, START, 'LEFT_GROUP'), back(1, day(22))])).toEqual([
      confirmed('LEFT_GROUP', day(21), day(22)),
    ]);
  });

  it('forgets a freeze when the student is back on day 45', () => {
    expect(build([stop(1, START, 'FROZEN'), back(1, day(45))])).toEqual([]);
  });

  it('confirms a freeze on day 60 when the student is back on day 61', () => {
    expect(build([stop(1, START, 'FROZEN'), back(1, day(61))])).toEqual([
      confirmed('FROZEN', day(60), day(61)),
    ]);
  });

  it('gives a freeze that joins before the confirmation its own grace period', () => {
    expect(
      build([
        stop(1, START, 'LEFT_GROUP'),
        stop(1, day(10), 'FROZEN'),
        back(1, day(40)),
      ]),
    ).toEqual([]);
  });

  it('keeps the grace period of a freeze when a lighter stop joins', () => {
    expect(
      build([
        stop(1, START, 'FROZEN'),
        stop(1, day(5), 'LEFT_GROUP'),
        back(1, day(30)),
      ]),
    ).toEqual([]);
  });

  it('keeps a confirmed episode confirmed when a freeze joins after it', () => {
    expect(
      build([stop(1, START, 'LEFT_GROUP'), stop(1, day(25), 'FROZEN')]),
    ).toEqual([confirmed('FROZEN', day(21), null)]);
  });

  it('keeps it confirmed when the student then comes back within the freeze period', () => {
    expect(
      build([
        stop(1, START, 'LEFT_GROUP'),
        stop(1, day(25), 'FROZEN'),
        back(1, day(40)),
      ]),
    ).toEqual([confirmed('FROZEN', day(21), day(40))]);
  });

  it('confirms at the grace end, not at an expulsion after it', () => {
    expect(
      build([stop(1, START, 'LEFT_GROUP'), stop(1, day(30), 'EXPELLED')]),
    ).toEqual([confirmed('EXPELLED', day(21), null)]);
  });

  it('confirms at an expulsion before the grace end', () => {
    expect(
      build([stop(1, START, 'LEFT_GROUP'), stop(1, day(5), 'EXPELLED')]),
    ).toEqual([confirmed('EXPELLED', day(5), null)]);
  });

  it.each([
    ['LEFT_GROUP', 20, 'pending', null],
    ['LEFT_GROUP', 21, 'confirmed', 21],
    ['FROZEN', 59, 'pending', null],
    ['FROZEN', 60, 'confirmed', 60],
    ['EXPELLED', 0, 'confirmed', 0],
  ] as const)(
    'reads a %s stop on day %i as %s',
    (kind, today, state, confirmedOn) => {
      const [episode] = build([stop(1, START, kind)], at(day(today)));
      expect(episode.state).toBe(state);
      expect(episode.confirmedAt).toEqual(
        confirmedOn === null ? null : at(day(confirmedOn)),
      );
    },
  );
});

describe('departuresInRange', () => {
  const episode = (
    studentId: number,
    startedAt: string,
    state: 'pending' | 'confirmed' = 'confirmed',
  ): DepartureEpisode => ({
    studentId,
    startedAt: at(startedAt),
    stopKind: 'LEFT_GROUP',
    state,
    confirmedAt: state === 'confirmed' ? at(startedAt) : null,
    returnedAt: null,
  });
  // September 2026 in Tashkent.
  const september = {
    gte: at('2026-08-31T19:00:00Z'),
    lt: at('2026-09-30T19:00:00Z'),
  };

  it('counts confirmed departures started inside the range, once per student', () => {
    const result = departuresInRange(
      [
        episode(1, '2026-09-02T10:00:00Z'),
        episode(1, '2026-09-20T10:00:00Z'),
        episode(2, '2026-09-10T10:00:00Z'),
      ],
      september,
      null,
    );
    expect(result.map((e) => [e.studentId, e.startedAt.toISOString()])).toEqual(
      [
        [1, '2026-09-02T10:00:00.000Z'],
        [2, '2026-09-10T10:00:00.000Z'],
      ],
    );
  });

  it('leaves out pending departures', () => {
    expect(
      departuresInRange(
        [episode(1, '2026-09-20T10:00:00Z', 'pending')],
        september,
        null,
      ),
    ).toEqual([]);
  });

  it('includes the range start and excludes its exclusive end', () => {
    const result = departuresInRange(
      [episode(1, '2026-08-31T19:00:00Z'), episode(2, '2026-09-30T19:00:00Z')],
      september,
      null,
    );
    expect(result.map((e) => e.studentId)).toEqual([1]);
  });

  it('drops departures before the reporting floor', () => {
    const result = departuresInRange(
      [episode(1, '2026-09-02T10:00:00Z'), episode(2, '2026-09-20T10:00:00Z')],
      september,
      at('2026-09-15T00:00:00Z'),
    );
    expect(result.map((e) => e.studentId)).toEqual([2]);
  });
});

describe('pendingInRange', () => {
  const pending = (studentId: number, startedAt: string): DepartureEpisode => ({
    studentId,
    startedAt: at(startedAt),
    stopKind: 'LEFT_GROUP',
    state: 'pending',
    confirmedAt: null,
    returnedAt: null,
  });
  // September 2026 in Tashkent.
  const september = {
    gte: at('2026-08-31T19:00:00Z'),
    lt: at('2026-09-30T19:00:00Z'),
  };

  it('counts only pending episodes that started inside the range', () => {
    const confirmed: DepartureEpisode = {
      ...pending(4, '2026-09-10T10:00:00Z'),
      state: 'confirmed',
      confirmedAt: at('2026-09-24T10:00:00Z'),
    };
    const result = pendingInRange(
      [
        pending(1, '2026-08-31T18:59:59Z'),
        pending(2, '2026-08-31T19:00:00Z'),
        pending(3, '2026-09-30T19:00:00Z'),
        confirmed,
      ],
      september,
      null,
    );
    expect(result.map((e) => e.studentId)).toEqual([2]);
  });

  it('drops pending episodes before the reporting floor', () => {
    const result = pendingInRange(
      [pending(1, '2026-09-02T10:00:00Z'), pending(2, '2026-09-20T10:00:00Z')],
      september,
      at('2026-09-15T00:00:00Z'),
    );
    expect(result.map((e) => e.studentId)).toEqual([2]);
  });
});

describe('openEpisodes', () => {
  it('keeps only the episodes the student has not come back from', () => {
    const open: DepartureEpisode = {
      studentId: 1,
      startedAt: at('2026-09-01T10:00:00Z'),
      stopKind: 'LEFT_GROUP',
      state: 'confirmed',
      confirmedAt: at('2026-09-15T10:00:00Z'),
      returnedAt: null,
    };
    const returned: DepartureEpisode = {
      ...open,
      studentId: 2,
      returnedAt: at('2026-09-20T10:00:00Z'),
    };
    expect(openEpisodes([open, returned])).toEqual([open]);
  });
});
