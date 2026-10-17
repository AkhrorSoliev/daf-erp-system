import {
  attendedOf,
  countRows,
  cutOf,
  cutRows,
  lessonsOf,
  markOf,
  minLessons,
  missPairs,
  rateOf,
  weekdayRows,
} from './attendance-counts';
import type {
  AttRow,
  AttendanceFacts,
  GroupFact,
} from './attendance-stats.types';

const SEPT = { from: '2026-09-01', to: '2026-10-01' };
const row = (
  date: string,
  status: AttRow['status'],
  over: Partial<AttRow> = {},
): AttRow => ({
  groupId: 'g1',
  studentId: 1,
  date,
  status,
  cancelled: false,
  ...over,
});
const group = (id: string, over: Partial<GroupFact> = {}): GroupFact => ({
  id,
  name: id.toUpperCase(),
  branchId: 1,
  deleted: false,
  courseId: 'c1',
  courseName: 'Standart',
  monthly: true,
  teacherId: 7,
  teacherName: 'Otabek Sobirov',
  ...over,
});

describe('markOf', () => {
  it('reads the @db.Date as its calendar day and cancellationId as «cancelled»', () => {
    expect(
      markOf({
        date: new Date('2026-09-07T00:00:00.000Z'),
        status: 'EXCUSED',
        cancellationId: 'c9',
      }),
    ).toEqual({
      date: '2026-09-07',
      status: 'EXCUSED',
      cancelled: true,
    });
  });
});

describe('countRows / rateOf', () => {
  it('counts the five kinds; a centre-cancelled lesson is never «Sababli»', () => {
    const c = countRows([
      row('2026-09-01', 'PRESENT'),
      row('2026-09-01', 'LATE', { studentId: 2 }),
      row('2026-09-01', 'ABSENT', { studentId: 3 }),
      row('2026-09-01', 'EXCUSED', { studentId: 4 }),
      row('2026-09-01', 'EXCUSED', { studentId: 5, cancelled: true }),
    ]);
    expect(c).toEqual({
      came: 1,
      late: 1,
      absent: 1,
      excused: 1,
      cancelled: 1,
    });
    expect(lessonsOf(c)).toBe(3);
    expect(attendedOf(c)).toBe(2);
    expect(rateOf(c)).toBe(66.7);
  });

  it('a zero denominator is null, never 0%', () => {
    expect(
      rateOf(
        countRows([
          row('2026-09-01', 'EXCUSED'),
          row('2026-09-02', 'EXCUSED', { cancelled: true }),
        ]),
      ),
    ).toBeNull();
    expect(rateOf(countRows([]))).toBeNull();
    expect(rateOf(countRows([row('2026-09-01', 'ABSENT')]))).toBe(0);
  });

  it('the window is [from, to): the upper day is out', () => {
    const rows = [row('2026-09-30', 'PRESENT'), row('2026-10-01', 'ABSENT')];
    expect(countRows(rows, SEPT)).toEqual({
      came: 1,
      late: 0,
      absent: 0,
      excused: 0,
      cancelled: 0,
    });
  });
});

describe('minLessons', () => {
  it('is ceil(60 × days / 30)', () => {
    expect(minLessons(30)).toBe(60);
    expect(minLessons(31)).toBe(62);
    expect(minLessons(17)).toBe(34);
    expect(minLessons(0)).toBe(0);
  });
});

describe('weekdayRows', () => {
  // 2026-09-07 is a Monday, 2026-09-13 a Sunday.
  it('Monday–Saturday always, Sunday only with a mark, by the calendar day', () => {
    expect(
      weekdayRows([row('2026-09-07', 'PRESENT')], SEPT).map((d) => d.day),
    ).toEqual([1, 2, 3, 4, 5, 6]);
    const w = weekdayRows(
      [row('2026-09-07', 'PRESENT'), row('2026-09-13', 'ABSENT')],
      SEPT,
    );
    expect(w.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(w[0].rate).toBe(100);
    expect(w[1].rate).toBeNull();
    expect(w[6].rate).toBe(0);
  });
});

describe('missPairs', () => {
  it('a (student, group) pair with 3+ «Kelmadi»; «jami» = Keldi + Kechikdi + Kelmadi', () => {
    const rows = [
      row('2026-09-01', 'ABSENT'),
      row('2026-09-02', 'ABSENT'),
      row('2026-09-03', 'ABSENT'),
      row('2026-09-04', 'PRESENT'),
      row('2026-09-05', 'EXCUSED'),
      row('2026-09-06', 'EXCUSED', { cancelled: true }),
      row('2026-09-01', 'ABSENT', { studentId: 2 }),
      row('2026-09-02', 'ABSENT', { studentId: 2 }),
      row('2026-10-01', 'ABSENT', { studentId: 2 }),
    ];
    expect(missPairs(rows, SEPT)).toEqual([
      { studentId: 1, groupId: 'g1', absent: 3, lessons: 4 },
    ]);
  });
});

describe('cutOf', () => {
  it('names a group «A1-04 · Ustoz», a teacherless group goes to «Ustozsiz»', () => {
    expect(cutOf(group('g1', { name: 'A1-04' }), 'group')).toEqual({
      key: 'g1',
      name: 'A1-04 · Otabek Sobirov',
      deleted: false,
    });
    expect(
      cutOf(group('g2', { teacherId: null, teacherName: null }), 'group').name,
    ).toBe('G2');
    expect(
      cutOf(group('g2', { teacherId: null, teacherName: null }), 'teacher'),
    ).toEqual({ key: 'none', name: 'Ustozsiz', deleted: false });
    expect(cutOf(group('g1'), 'teacher')).toEqual({
      key: '7',
      name: 'Otabek Sobirov',
      deleted: false,
    });
    expect(cutOf(group('g1', { deleted: true }), 'course')).toEqual({
      key: 'c1',
      name: 'Standart',
      deleted: false,
    });
  });
});

describe('cutRows', () => {
  const facts: AttendanceFacts = {
    groups: new Map([
      ['g1', group('g1', { name: 'A1-04' })],
      ['g2', group('g2', { name: 'A1-13', deleted: true })],
      [
        'g3',
        group('g3', {
          name: 'B1-01',
          teacherId: null,
          teacherName: null,
          courseId: 'c2',
          courseName: 'Intensiv',
        }),
      ],
    ]),
    rows: [
      row('2026-09-01', 'PRESENT', { groupId: 'g1' }),
      row('2026-09-02', 'ABSENT', { groupId: 'g1' }),
      row('2026-09-01', 'ABSENT', { groupId: 'g2', studentId: 9 }),
      row('2026-09-02', 'ABSENT', { groupId: 'g2', studentId: 9 }),
      row('2026-09-03', 'ABSENT', { groupId: 'g2', studentId: 9 }),
      row('2026-09-04', 'PRESENT', { groupId: 'g2', studentId: 8 }),
      row('2026-09-01', 'EXCUSED', { groupId: 'g3', studentId: 5 }),
    ],
  };

  it('lowest rate first, a row with no rate last; the deleted group is marked', () => {
    const rows = cutRows(facts, SEPT, 'group');
    expect(
      rows.map((r) => [r.key, r.rate, r.lessons, r.missers, r.deleted]),
    ).toEqual([
      ['g2', 25, 4, 1, true],
      ['g1', 50, 2, 0, false],
      ['g3', null, 0, 0, false],
    ]);
  });

  it("the teacher cut adds a teacher's groups; Σ rows = the window (no row is dropped)", () => {
    const rows = cutRows(facts, SEPT, 'teacher');
    expect(rows.map((r) => r.key)).toEqual(['7', 'none']);
    expect(rows[0].counts).toEqual({
      came: 2,
      late: 0,
      absent: 4,
      excused: 0,
      cancelled: 0,
    });
    expect(rows[0].missers).toBe(1);
    expect(rows[1].counts.excused).toBe(1);
  });

  it('ties keep a stable order: more lessons first, then the name (uz, numeric)', () => {
    const g = new Map([
      ['a', group('a', { name: 'A1-10', teacherName: null })],
      ['b', group('b', { name: 'A1-9', teacherName: null })],
    ]);
    const rows = cutRows(
      {
        groups: g,
        rows: [
          row('2026-09-01', 'PRESENT', { groupId: 'a' }),
          row('2026-09-01', 'PRESENT', { groupId: 'b' }),
        ],
      },
      SEPT,
      'group',
    );
    expect(rows.map((r) => r.name)).toEqual(['A1-9', 'A1-10']);
  });
});
