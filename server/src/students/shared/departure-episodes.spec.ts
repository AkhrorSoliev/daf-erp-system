import {
  buildDepartureEpisodes,
  departuresInRange,
  openEpisodes,
  pendingInRange,
  type DepartureEpisode,
  type StopKind,
  type StudentEvent,
} from './departure-episodes';

const at = (s: string) => new Date(s);
const GRACE = 14;
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
const build = (events: StudentEvent[]) =>
  buildDepartureEpisodes(events, { graceDays: GRACE, now: NOW });

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

  it('counts archiving an active student on its own day', () => {
    const [episode] = build([stop(1, '2026-09-24T10:00:00Z', 'ARCHIVED')]);
    expect(episode.state).toBe('confirmed');
    expect(episode.confirmedAt).toEqual(at('2026-09-24T10:00:00Z'));
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
    expect(episode.confirmedAt).toEqual(at('2026-09-15T10:00:00Z'));
  });

  it('forgets a stop the student came back from within the grace period', () => {
    expect(
      build([
        stop(1, '2026-09-01T10:00:00Z', 'LEFT_GROUP'),
        back(1, '2026-09-04T10:00:00Z'),
      ]),
    ).toEqual([]);
  });

  it('keeps a late return as a departure and records when they came back', () => {
    expect(
      build([
        stop(1, '2026-08-01T10:00:00Z', 'LEFT_GROUP'),
        back(1, '2026-08-21T10:00:00Z'),
      ]),
    ).toEqual([
      {
        studentId: 1,
        startedAt: at('2026-08-01T10:00:00Z'),
        stopKind: 'LEFT_GROUP',
        state: 'confirmed',
        confirmedAt: at('2026-08-15T10:00:00Z'),
        returnedAt: at('2026-08-21T10:00:00Z'),
      },
    ]);
  });

  it('treats a return exactly at the end of the grace period as a departure', () => {
    const [episode] = build([
      stop(1, '2026-08-01T10:00:00Z', 'FROZEN'),
      back(1, '2026-08-15T10:00:00Z'),
    ]);
    expect(episode.state).toBe('confirmed');
    expect(episode.returnedAt).toEqual(at('2026-08-15T10:00:00Z'));
  });

  it('forgets a freeze the student came back from one second before the end', () => {
    expect(
      build([
        stop(1, '2026-08-01T10:00:00Z', 'FROZEN'),
        back(1, '2026-08-15T09:59:59Z'),
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

  it('confirms an open freeze the moment the student is archived', () => {
    const [episode] = build([
      stop(1, '2026-09-20T10:00:00Z', 'FROZEN'),
      stop(1, '2026-09-22T10:00:00Z', 'ARCHIVED'),
    ]);
    expect(episode.startedAt).toEqual(at('2026-09-20T10:00:00Z'));
    expect(episode.stopKind).toBe('ARCHIVED');
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
