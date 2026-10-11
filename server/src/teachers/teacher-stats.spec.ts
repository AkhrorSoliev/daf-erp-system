import {
  buildTeacherStats,
  statsMonths,
  teachersAt,
  type GroupTeachers,
  type StatsEnrollment,
  type TeacherStatsInput,
} from './teacher-stats';
import type { DepartureEpisode } from '../students/shared/departure-episodes';

const T = 10001; // the teacher
const OTHER = 10002;
const at = (iso: string) => new Date(iso);

function group(over: Partial<GroupTeachers> = {}): GroupTeachers {
  return { current: [T], history: [], deletedAt: null, ...over };
}

function enrollment(over: Partial<StatsEnrollment>): StatsEnrollment {
  return {
    groupId: 'g1',
    studentId: 1,
    status: 'ACTIVE',
    createdAt: at('2026-08-05T06:00:00Z'),
    statusChangedAt: null,
    log: [],
    ...over,
  };
}

function input(over: Partial<TeacherStatsInput>): TeacherStatsInput {
  return {
    teacherId: T,
    months: ['2026-08', '2026-09', '2026-10'],
    now: at('2026-10-11T07:00:00Z'),
    groups: new Map([['g1', group()]]),
    enrollments: [],
    attendance: [],
    episodes: [],
    floor: null,
    salaryByMonth: new Map(),
    ...over,
  };
}

const byMonth = (rows: ReturnType<typeof buildTeacherStats>) =>
  Object.fromEntries(rows.map((r) => [r.month, r]));

describe('teachersAt', () => {
  it("rolls today's set back through every change made after the instant", () => {
    const g = group({
      current: [OTHER],
      history: [
        { createdAt: at('2026-09-15T00:00:00Z'), previousTeacherIds: [T] },
      ],
    });
    expect(teachersAt(g, at('2026-09-01T00:00:00Z'))).toEqual([T]);
    expect(teachersAt(g, at('2026-09-20T00:00:00Z'))).toEqual([OTHER]);
  });
});

describe('buildTeacherStats', () => {
  it('counts a student active at each month end from the month they joined', () => {
    const r = byMonth(
      buildTeacherStats(
        input({
          enrollments: [
            enrollment({
              log: [
                { status: 'ACTIVE', transitionAt: at('2026-09-03T06:00:00Z') },
              ],
              createdAt: at('2026-09-03T06:00:00Z'),
            }),
          ],
        }),
      ),
    );
    expect(r['2026-08'].activeStudents).toBe(0);
    expect(r['2026-09']).toMatchObject({ activeStudents: 1, joined: 1 });
    expect(r['2026-10']).toMatchObject({ activeStudents: 1, joined: 0 });
  });

  it('drops a group from the teacher once it was handed to another teacher', () => {
    const groups = new Map([
      [
        'g1',
        group({
          current: [OTHER],
          history: [
            { createdAt: at('2026-09-15T00:00:00Z'), previousTeacherIds: [T] },
          ],
        }),
      ],
    ]);
    const r = byMonth(
      buildTeacherStats(
        input({
          groups,
          enrollments: [enrollment({})],
          attendance: [
            { groupId: 'g1', date: '2026-09-02', status: 'PRESENT', count: 3 },
            { groupId: 'g1', date: '2026-09-02', status: 'ABSENT', count: 1 },
            { groupId: 'g1', date: '2026-09-20', status: 'ABSENT', count: 5 },
          ],
        }),
      ),
    );
    expect(r['2026-08'].activeStudents).toBe(1);
    expect(r['2026-09'].activeStudents).toBe(0);
    // Only the lesson before the hand-over is the teacher's: 3 of 4.
    expect(r['2026-09'].attendancePct).toBe(75);
    expect(r['2026-10'].attendancePct).toBeNull();
  });

  it('closes enrollments of a deleted group at the deletion', () => {
    const groups = new Map([
      ['g1', group({ deletedAt: at('2026-09-10T00:00:00Z') })],
    ]);
    const r = byMonth(
      buildTeacherStats(input({ groups, enrollments: [enrollment({})] })),
    );
    expect(r['2026-08'].activeStudents).toBe(1);
    expect(r['2026-09'].activeStudents).toBe(0);
  });

  it('attributes a departure to the group the student was in just before it', () => {
    const stoppedAt = at('2026-09-12T08:00:00Z');
    const episodes: DepartureEpisode[] = [
      {
        studentId: 1,
        startedAt: stoppedAt,
        stopKind: 'LEFT_GROUP',
        state: 'confirmed',
        confirmedAt: at('2026-10-03T08:00:00Z'),
        returnedAt: null,
      },
      {
        studentId: 2,
        startedAt: at('2026-10-05T08:00:00Z'),
        stopKind: 'FROZEN',
        state: 'pending',
        confirmedAt: null,
        returnedAt: null,
      },
      // Never in the teacher's group: not theirs.
      {
        studentId: 99,
        startedAt: stoppedAt,
        stopKind: 'EXPELLED',
        state: 'confirmed',
        confirmedAt: stoppedAt,
        returnedAt: null,
      },
    ];
    const r = byMonth(
      buildTeacherStats(
        input({
          episodes,
          enrollments: [
            enrollment({
              studentId: 1,
              status: 'DROPPED',
              statusChangedAt: stoppedAt,
              log: [
                { status: 'ACTIVE', transitionAt: at('2026-08-05T06:00:00Z') },
                { status: 'DROPPED', transitionAt: stoppedAt },
              ],
            }),
            enrollment({ studentId: 2 }),
          ],
        }),
      ),
    );
    expect(r['2026-09']).toMatchObject({ left: 1, leftPending: 0 });
    expect(r['2026-10']).toMatchObject({ left: 0, leftPending: 1 });
  });

  it('passes the salary through and leaves an unknown month null', () => {
    const r = byMonth(
      buildTeacherStats(
        input({ salaryByMonth: new Map([['2026-09', 9_840_000]]) }),
      ),
    );
    expect(r['2026-09'].salary).toBe(9_840_000);
    expect(r['2026-08'].salary).toBeNull();
  });
});

describe('statsMonths', () => {
  it('gives the last six months, none before the floor', () => {
    expect(statsMonths('2026-10', null)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(statsMonths('2026-10', '2026-08')).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });
});
