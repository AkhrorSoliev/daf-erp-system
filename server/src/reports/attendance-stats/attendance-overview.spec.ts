import { cutRows } from './attendance-counts';
import { buildOverview, missersOf } from './attendance-overview';
import { resolvePeriod } from './attendance-stats-period';
import type {
  AttRow,
  AttendanceFacts,
  Counts,
  CreditResult,
  GroupFact,
} from './attendance-stats.types';

let seq = 0;
/** n marks of one status; a distinct student each unless `over.studentId` pins one. */
const marks = (
  groupId: string,
  status: AttRow['status'],
  n: number,
  over: Partial<AttRow> = {},
  month = '2026-09',
): AttRow[] =>
  Array.from({ length: n }, (_, i) => ({
    groupId,
    studentId: 1000 + seq++,
    date: `${month}-${String((i % 28) + 1).padStart(2, '0')}`,
    status,
    cancelled: false,
    ...over,
  }));
const group = (
  id: string,
  name: string,
  over: Partial<GroupFact> = {},
): GroupFact => ({
  id,
  name,
  branchId: 1,
  deleted: false,
  courseId: 'c1',
  courseName: 'Standart',
  monthly: true,
  teacherId: 7,
  teacherName: 'Otabek Sobirov',
  ...over,
});
const sum = (list: Counts[]): Counts =>
  list.reduce(
    (s, c) => ({
      came: s.came + c.came,
      late: s.late + c.late,
      absent: s.absent + c.absent,
      excused: s.excused + c.excused,
      cancelled: s.cancelled + c.cancelled,
    }),
    { came: 0, late: 0, absent: 0, excused: 0, cancelled: 0 },
  );

const facts: AttendanceFacts = {
  groups: new Map([
    ['g1', group('g1', 'A1-04')],
    ['g2', group('g2', 'A1-13', { deleted: true })],
    [
      'g3',
      group('g3', 'B1-01', {
        teacherId: null,
        teacherName: null,
        courseId: 'c2',
        courseName: 'Intensiv',
        monthly: false,
      }),
    ],
  ]),
  rows: [
    ...marks('g1', 'PRESENT', 50),
    ...marks('g1', 'LATE', 5),
    ...marks('g1', 'ABSENT', 12),
    ...marks('g1', 'ABSENT', 3, { studentId: 1 }),
    ...marks('g1', 'EXCUSED', 2),
    ...marks('g1', 'EXCUSED', 1, { cancelled: true }),
    ...marks('g2', 'PRESENT', 40),
    ...marks('g2', 'ABSENT', 20),
    ...marks('g2', 'ABSENT', 4, { studentId: 20 }),
    ...marks('g3', 'PRESENT', 9),
    ...marks('g3', 'ABSENT', 1),
    ...marks('g1', 'PRESENT', 10, {}, '2026-08'),
    ...marks('g1', 'ABSENT', 10, {}, '2026-08'),
  ],
};
const CREDIT: CreditResult = {
  lessons: 2,
  students: 2,
  amount: 60_000,
  enabled: true,
  uncharged: 0,
};
const period = resolvePeriod('2026-09-01', '2026-09-30', '2026-10-17');
const build = (
  cut: 'group' | 'teacher' | 'course' = 'group',
  page = 1,
  pageSize = 10,
) =>
  buildOverview({
    facts,
    period,
    currentMonth: '2026-10',
    credit: CREDIT,
    cut,
    page,
    pageSize,
  });

describe('buildOverview', () => {
  it('the card: counts, lessons, attended, rate, the previous month', () => {
    const o = build();
    expect(o.card).toEqual({
      counts: { came: 99, late: 5, absent: 40, excused: 2, cancelled: 1 },
      lessons: 144,
      attended: 104,
      rate: 72.2,
      previousRate: 50,
    });
    expect(o.previous).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    expect(o.credit).toBe(CREDIT);
  });

  it('parity: card = Σ weekdays = Σ every cut (hidden rows included) = the month bar', () => {
    const o = build();
    expect(sum(o.weekdays.map((w) => w.counts))).toEqual(o.card.counts);
    for (const cut of ['group', 'teacher', 'course'] as const) {
      expect(
        sum(cutRows(facts, period.window, cut).map((r) => r.counts)),
      ).toEqual(o.card.counts);
    }
    const sept = o.months.find((m) => m.month === '2026-09');
    expect(sept).toEqual({
      month: '2026-09',
      counts: o.card.counts,
      rate: o.card.rate,
      partial: false,
    });
  });

  it("month bars: May to the period's month, empty months are «—», not 0%", () => {
    const o = build();
    expect(o.months.map((m) => [m.month, m.rate])).toEqual([
      ['2026-05', null],
      ['2026-06', null],
      ['2026-07', null],
      ['2026-08', 50],
      ['2026-09', 72.2],
    ]);
  });

  it('the group cut: lowest first, the small group hidden but counted, deleted marked', () => {
    const o = build();
    expect(o.cut.minLessons).toBe(60);
    expect(
      o.cut.rows.map((r) => [r.name, r.rate, r.lessons, r.missers, r.deleted]),
    ).toEqual([
      ['A1-13 · Otabek Sobirov', 62.5, 64, 1, true],
      ['A1-04 · Otabek Sobirov', 78.6, 70, 1, false],
    ]);
    expect(o.cut.total).toBe(2);
    expect(o.cut.hidden).toBe(1);
  });

  it('the teacher and course cuts add groups; «Ustozsiz» is a row of its own', () => {
    const t = build('teacher');
    expect(
      t.cut.rows.map((r) => [r.key, r.rate, r.lessons, r.missers]),
    ).toEqual([['7', 70.9, 134, 2]]);
    expect(t.cut.hidden).toBe(1); // «Ustozsiz» (B1-01, 10 marks)
    expect(cutRows(facts, period.window, 'teacher').map((r) => r.key)).toEqual([
      '7',
      'none',
    ]);
    expect(build('course').cut.rows.map((r) => r.name)).toEqual(['Standart']);
  });

  it('a page past the end is clamped to the last page', () => {
    const o = build('group', 7, 10);
    expect(o.cut.page).toBe(1);
    expect(o.cut.rows).toHaveLength(2);
  });

  it('the current month bar is marked unfinished', () => {
    const now = resolvePeriod('2026-10-01', '2026-10-31', '2026-10-17');
    const o = buildOverview({
      facts,
      period: now,
      currentMonth: '2026-10',
      credit: CREDIT,
      cut: 'group',
      page: 1,
      pageSize: 10,
    });
    expect(o.months[o.months.length - 1]).toMatchObject({
      month: '2026-10',
      partial: true,
      rate: null,
    });
    expect(o.cut.minLessons).toBe(34);
  });
});

describe('one rule everywhere', () => {
  it("«ko'p qoldiruvchi»: a cut row's count = the distinct students of missersOf", () => {
    for (const cut of ['group', 'teacher', 'course'] as const) {
      for (const r of cutRows(facts, period.window, cut)) {
        const ids = new Set(
          missersOf(facts, period.window, cut, r.key).map((p) => p.studentId),
        );
        expect(ids.size).toBe(r.missers);
      }
    }
  });

  it('a Sunday mark is a seventh weekday row and still adds up', () => {
    const withSunday: AttendanceFacts = {
      ...facts,
      rows: [
        ...facts.rows,
        ...marks('g1', 'PRESENT', 1, { date: '2026-09-06' }),
      ],
    };
    const o = buildOverview({
      facts: withSunday,
      period,
      currentMonth: '2026-10',
      credit: CREDIT,
      cut: 'group',
      page: 1,
      pageSize: 10,
    });
    expect(o.weekdays.map((w) => w.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(sum(o.weekdays.map((w) => w.counts))).toEqual(o.card.counts);
  });
});

describe('missersOf', () => {
  it('the pairs with 3+ «Kelmadi» of one cut row', () => {
    expect(
      missersOf(facts, period.window, 'teacher', '7')
        .map((p) => p.studentId)
        .sort(),
    ).toEqual([1, 20]);
    expect(missersOf(facts, period.window, 'group', 'g2')).toEqual([
      { studentId: 20, groupId: 'g2', absent: 4, lessons: 4 },
    ]);
    expect(missersOf(facts, period.window, 'group', 'g3')).toEqual([]);
  });
});
