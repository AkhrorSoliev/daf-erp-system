import { BadRequestException } from '@nestjs/common';
import type { EnrollmentStatus } from '@prisma/client';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import {
  splitMonthCharges,
  splitMonthChargesByCharge,
  type MonthChargeLine,
} from '../month-charges';
import {
  buildRowsResponse,
  courseRows,
  filteredRows,
  groupDrawer,
  groupRows,
  parseReportMonth,
  payStatus,
  studentLines,
  studentMark,
  studentSheetLines,
  summarize,
  teacherRows,
  toGpQuery,
  type GpCharge,
  type GpData,
  type GpGroup,
  type GpStudent,
} from './group-payments.math';

// Made-up people, groups and amounts.
const charge = (
  id: string,
  studentId: number,
  groupId: string,
  charged: number,
  unpaid: number,
  enrollmentStatus: EnrollmentStatus = 'ACTIVE',
  createdAt = '2026-09-01T05:00:00Z',
): GpCharge => ({
  id,
  studentId,
  groupId,
  enrollmentId: `e-${id}`,
  charged,
  unpaid,
  enrollmentStatus,
  enrollmentCreatedAt: new Date(createdAt),
});
const group = (id: string, over: Partial<GpGroup> = {}): GpGroup => ({
  id,
  name: id.toUpperCase(),
  groupNumber: null,
  courseId: 'k1',
  courseName: 'Nemis tili A1',
  teachers: [],
  deleted: false,
  closed: false,
  ...over,
});
const student = (id: number, over: Partial<GpStudent> = {}): GpStudent => ({
  id,
  firstName: 'Ism',
  lastName: `Familiya${id}`,
  phone: '900000000',
  archived: false,
  ...over,
});
const data = (
  charges: GpCharge[],
  groups: GpGroup[],
  students: GpStudent[] = [],
): GpData => ({
  month: '2026-10',
  charges,
  groups: new Map(groups.map((g) => [g.id, g])),
  students: new Map(students.map((s) => [s.id, s])),
});

const OLIM = { id: 20001, name: 'Olim Karimov' };
const AZIZA = { id: 20002, name: 'Aziza Rahimova' };

const MONTH = data(
  [
    charge('c1', 10001, 'g1', 450_000, 0),
    charge('c2', 10002, 'g1', 450_000, 450_000, 'FROZEN'),
    charge(
      'c3',
      10003,
      'g2',
      300_000,
      100_000,
      'DROPPED',
      '2026-09-01T05:00:00Z',
    ),
    charge(
      'c4',
      10003,
      'g2',
      150_000,
      50_000,
      'ACTIVE',
      '2026-10-10T05:00:00Z',
    ),
    charge('c5', 10004, 'g3', 400_000, 400_000),
    charge('c6', 10001, 'g2', 200_000, 0),
    charge('c7', 10005, 'g4', 300_000, 0, 'COMPLETED'),
  ],
  [
    group('g1', { name: 'A1-01', groupNumber: 11, teachers: [OLIM, AZIZA] }),
    group('g2', { name: 'A1-02', groupNumber: 12, teachers: [OLIM] }),
    group('g3', {
      name: 'B1-01',
      courseId: 'k2',
      courseName: 'Nemis tili B1',
      closed: true,
    }),
    group('g4', {
      name: 'A2-01',
      groupNumber: 14,
      courseId: 'k3',
      courseName: 'Nemis tili A2',
      teachers: [AZIZA],
      deleted: true,
    }),
  ],
  [
    student(10001),
    student(10002),
    student(10003),
    student(10004, { archived: true }),
    student(10005),
  ],
);
const Q = toGpQuery({});
const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe('parseReportMonth', () => {
  const now = new Date('2026-10-16T07:00:00Z');
  it('no month is the current Tashkent month; a month in range passes', () => {
    expect(parseReportMonth(undefined, now)).toBe('2026-10');
    expect(parseReportMonth('2026-09', now)).toBe('2026-09');
    // 01.11 00:30 in Tashkent is still 31.10 in UTC.
    expect(parseReportMonth(undefined, new Date('2026-10-31T19:30:00Z'))).toBe(
      '2026-11',
    );
  });
  it('refuses a month before September 2026 and a month ahead', () => {
    expect(() => parseReportMonth('2026-08', now)).toThrow(
      new BadRequestException('Bu hisobot sentabr 2026 dan boshlanadi'),
    );
    expect(() => parseReportMonth('2026-11', now)).toThrow(
      new BadRequestException("Kelajak oyni tanlab bo'lmaydi"),
    );
  });
});

describe('student status and mark (spec §4.4)', () => {
  it('status by what is left', () => {
    expect(payStatus(450_000, 0)).toBe('toladi');
    expect(payStatus(450_000, 1)).toBe('qisman');
    expect(payStatus(450_000, 450_000)).toBe('tolamagan');
    expect(payStatus(0, 0)).toBe('toladi');
  });
  it('mark: an archived card wins, then the enrollment', () => {
    expect(studentMark(false, 'ACTIVE')).toBeNull();
    expect(studentMark(false, 'FROZEN')).toBe('muzlatilgan');
    for (const s of ['DROPPED', 'TRANSFERRED', 'COMPLETED'] as const)
      expect(studentMark(false, s)).toBe('chiqqan');
    expect(studentMark(true, 'ACTIVE')).toBe('arxivda');
  });
});

describe('group rows', () => {
  it('one row per group; two charges of one student in one group are one student', () => {
    const rows = Object.fromEntries(groupRows(MONTH).map((r) => [r.id, r]));
    expect(rows.g1).toEqual({
      id: 'g1',
      name: 'A1-01',
      sub: 'Nemis tili A1',
      teachers: ['Olim Karimov', 'Aziza Rahimova'],
      marks: [],
      students: 2,
      charged: 900_000,
      paid: 450_000,
      unpaid: 450_000,
      paidPct: 50,
      unpaidStudents: 1,
    });
    expect(rows.g2).toMatchObject({
      students: 2,
      charged: 650_000,
      paid: 500_000,
      unpaid: 150_000,
      paidPct: 76.9,
      unpaidStudents: 1,
    });
    expect(rows.g3).toMatchObject({
      marks: ['yopilgan'],
      sub: 'Nemis tili B1',
      teachers: [],
      paidPct: 0,
    });
    expect(rows.g4).toMatchObject({
      marks: ['ochirilgan'],
      unpaid: 0,
      paidPct: 100,
      unpaidStudents: 0,
    });
  });
});

describe('teacher rows (current teachers, spec §4.3)', () => {
  it('a two-teacher group counts for both; a student of two groups of one teacher counts once; no teacher → «Ustozsiz»', () => {
    const rows = Object.fromEntries(teacherRows(MONTH).map((r) => [r.name, r]));
    expect(rows['Olim Karimov']).toEqual({
      id: '20001',
      name: 'Olim Karimov',
      sub: '2 guruh',
      marks: [],
      students: 3,
      charged: 1_550_000,
      paid: 950_000,
      unpaid: 600_000,
      paidPct: 61.3,
      unpaidStudents: 2,
    });
    expect(rows['Aziza Rahimova']).toMatchObject({
      id: '20002',
      sub: '2 guruh',
      students: 3,
      charged: 1_200_000,
      unpaid: 450_000,
      paidPct: 62.5,
    });
    expect(rows.Ustozsiz).toMatchObject({
      id: 'ustozsiz',
      sub: '1 guruh',
      charged: 400_000,
      unpaid: 400_000,
    });
    expect(rows['Olim Karimov'].teachers).toBeUndefined();
  });
});

describe('course rows', () => {
  it('a course row adds its groups', () => {
    const rows = Object.fromEntries(courseRows(MONTH).map((r) => [r.id, r]));
    expect(rows.k1).toMatchObject({
      name: 'Nemis tili A1',
      sub: '2 guruh',
      students: 3,
      charged: 1_550_000,
      unpaid: 600_000,
    });
    expect(rows.k2).toMatchObject({
      name: 'Nemis tili B1',
      sub: '1 guruh',
      unpaid: 400_000,
    });
    expect(rows.k3).toMatchObject({ name: 'Nemis tili A2', paidPct: 100 });
  });
});

describe('summary (spec §3.3)', () => {
  it('the whole month, whatever the table shows', () => {
    const expected = {
      charged: 2_250_000,
      paid: 1_250_000,
      unpaid: 1_000_000,
      paidPct: 55.6,
      students: 5,
      unpaidStudents: 3,
      groups: 4,
      fullyPaidGroups: 1,
      underHalfGroups: 1,
      avgGroupPct: 56.7,
    };
    expect(summarize(MONTH)).toEqual(expected);
    expect(
      buildRowsResponse(
        MONTH,
        toGpQuery({ kesim: 'ustoz', q: 'olim', qarzdor: '1', tartib: 'nomi' }),
      ).summary,
    ).toEqual(expected);
  });
  it('an empty month: zeros and no percentages', () => {
    expect(summarize(data([], []))).toEqual({
      charged: 0,
      paid: 0,
      unpaid: 0,
      paidPct: null,
      students: 0,
      unpaidStudents: 0,
      groups: 0,
      fullyPaidGroups: 0,
      underHalfGroups: 0,
      avgGroupPct: null,
    });
  });
});

describe('search, sort, «Faqat qarzi borlar», paging (spec §3.4)', () => {
  const rows = (q: Parameters<typeof toGpQuery>[0]) =>
    filteredRows(MONTH, toGpQuery(q));
  it('sorts by lowest percentage (default), by most left, by name', () => {
    expect(names(rows({}))).toEqual(['B1-01', 'A1-01', 'A1-02', 'A2-01']);
    expect(names(rows({ tartib: 'qoldi' }))).toEqual([
      'A1-01',
      'B1-01',
      'A1-02',
      'A2-01',
    ]);
    expect(names(rows({ tartib: 'nomi' }))).toEqual([
      'A1-01',
      'A1-02',
      'A2-01',
      'B1-01',
    ]);
    expect(names(rows({ kesim: 'ustoz' }))).toEqual([
      'Ustozsiz',
      'Olim Karimov',
      'Aziza Rahimova',
    ]);
  });
  it('equal name and figures: id order, whatever the input order', () => {
    const g = [group('gb', { name: 'A1-01' }), group('ga', { name: 'A1-01' })];
    const c = [
      charge('c1', 10001, 'gb', 450_000, 0),
      charge('c2', 10002, 'ga', 450_000, 0),
    ];
    for (const tartib of ['foiz', 'qoldi', 'nomi'] as const) {
      for (const flip of [false, true]) {
        const d = data(
          flip ? [...c].reverse() : c,
          flip ? [...g].reverse() : g,
        );
        expect(filteredRows(d, toGpQuery({ tartib })).map((r) => r.id)).toEqual(
          ['ga', 'gb'],
        );
      }
    }
  });
  it('the drawer orders equal students by id, whatever the input order', () => {
    const c = [
      charge('c1', 10002, 'g1', 450_000, 0),
      charge('c2', 10001, 'g1', 450_000, 0),
    ];
    const s = [student(10002), student(10001)].map((x) => ({
      ...x,
      lastName: 'Bir',
    }));
    for (const flip of [false, true]) {
      const d = data(flip ? [...c].reverse() : c, [group('g1')], s);
      expect(studentLines(d, 'g1').map((x) => x.id)).toEqual([10001, 10002]);
    }
  });
  it('«Faqat qarzi borlar» drops rows with nothing left', () => {
    expect(names(rows({ qarzdor: '1' }))).toEqual(['B1-01', 'A1-01', 'A1-02']);
  });
  it('Guruhlar: group name or number, teacher, course — any case, trimmed', () => {
    expect(names(rows({ q: '12' }))).toEqual(['A1-02']);
    expect(names(rows({ q: 'aziza' }))).toEqual(['A1-01', 'A2-01']);
    expect(names(rows({ q: 'b1' }))).toEqual(['B1-01']);
    expect(names(rows({ q: '  OLIM ' }))).toEqual(['A1-01', 'A1-02']);
  });
  it('Ustozlar search the teacher only, Kurslar the course only', () => {
    expect(names(rows({ kesim: 'ustoz', q: 'aziza' }))).toEqual([
      'Aziza Rahimova',
    ]);
    expect(names(rows({ kesim: 'ustoz', q: 'a1' }))).toEqual([]);
    expect(names(rows({ kesim: 'kurs', q: 'a2' }))).toEqual(['Nemis tili A2']);
  });
  it('pages after filtering; total counts the filtered rows', () => {
    const r = buildRowsResponse(
      MONTH,
      toGpQuery({ tartib: 'nomi', sahifa: 2, soni: 3 }),
    );
    expect(names(r.rows)).toEqual(['B1-01']);
    expect(r.total).toBe(4);
    expect(r.month).toBe('2026-10');
  });
  it('the two-teacher note only in the Ustozlar cut, only when such a group exists', () => {
    expect(
      buildRowsResponse(MONTH, toGpQuery({ kesim: 'ustoz' })).multiTeacherNote,
    ).toBe(true);
    expect(buildRowsResponse(MONTH, Q).multiTeacherNote).toBe(false);
    const single = data(
      MONTH.charges.filter((c) => c.groupId !== 'g1'),
      [...MONTH.groups.values()].filter((g) => g.id !== 'g1'),
    );
    expect(
      buildRowsResponse(single, toGpQuery({ kesim: 'ustoz' })).multiTeacherNote,
    ).toBe(false);
  });
});

describe('the group drawer (spec §3.6)', () => {
  it('students merged per student, unpaid first, the latest enrollment marks', () => {
    expect(
      studentLines(MONTH, 'g1').map((s) => [s.id, s.status, s.mark, s.unpaid]),
    ).toEqual([
      [10002, 'tolamagan', 'muzlatilgan', 450_000],
      [10001, 'toladi', null, 0],
    ]);
    expect(studentLines(MONTH, 'g2')[0]).toEqual({
      id: 10003,
      firstName: 'Ism',
      lastName: 'Familiya10003',
      phone: '900000000',
      charged: 450_000,
      paid: 300_000,
      unpaid: 150_000,
      status: 'qisman',
      mark: null,
    });
    expect(studentLines(MONTH, 'g3')[0].mark).toBe('arxivda');
    expect(studentLines(MONTH, 'g4')[0].mark).toBe('chiqqan');
  });
  it('the drawer answer, or null for a group with no charge this month', () => {
    expect(groupDrawer(MONTH, 'g1')).toMatchObject({
      group: {
        id: 'g1',
        name: 'A1-01',
        course: 'Nemis tili A1',
        teachers: ['Olim Karimov', 'Aziza Rahimova'],
        deleted: false,
        closed: false,
      },
      charged: 900_000,
      paid: 450_000,
      unpaid: 450_000,
      paidPct: 50,
    });
    expect(groupDrawer(MONTH, 'g4')?.group).toMatchObject({ deleted: true });
    expect(groupDrawer(MONTH, 'nope')).toBeNull();
  });
});

describe("the Excel's student sheet (spec §5.4)", () => {
  it('every student–group line by group name; «qarzdor» keeps the ones with something left', () => {
    const all = studentSheetLines(MONTH, false);
    expect(all.map((s) => [s.groupName, s.id])).toEqual([
      ['A1-01', 10002],
      ['A1-01', 10001],
      ['A1-02', 10003],
      ['A1-02', 10001],
      ['A2-01', 10005],
      ['B1-01', 10004],
    ]);
    expect(all[0].teachers).toEqual(['Olim Karimov', 'Aziza Rahimova']);
    expect(studentSheetLines(MONTH, true).map((s) => s.id)).toEqual([
      10002, 10003, 10004,
    ]);
  });
});

/** Seeded generator — a failing case is replayed by its seed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const line = (
  id: string,
  studentId: number,
  groupId: string,
  month: string,
  chargedAmount: number,
  branchId = 1,
): MonthChargeLine => {
  const [periodYear, periodMonth] = month.split('-').map(Number);
  return {
    id,
    studentId,
    groupId,
    enrollmentId: `e-${id}`,
    periodYear,
    periodMonth,
    branchId,
    chargedAmount,
  };
};
function randomMonth(seed: number) {
  const r = rng(seed);
  const pick = (n: number) => Math.floor(r() * n);
  const amounts = [0, 1, 137_500, 300_000, 450_000, 999_999];
  const rows: MonthChargeLine[] = [];
  const balances = new Map<number, number>();
  let n = 0;
  const students = 1 + pick(8);
  for (let i = 0; i < students; i++) {
    const studentId = 10001 + i;
    const count = 1 + pick(3);
    for (let k = 0; k < count; k++) {
      n += 1;
      rows.push(
        line(
          `c${n}`,
          studentId,
          `g${1 + pick(4)}`,
          '2026-10',
          amounts[pick(amounts.length)],
          1 + pick(2),
        ),
      );
    }
    if (r() < 0.4) {
      n += 1;
      rows.push(line(`c${n}`, studentId, 'g1', '2026-11', 450_000));
    }
    balances.set(studentId, pick(1_500_001) - 1_000_000);
  }
  return { rows, balances };
}

describe('equality with the overview (spec §4.2, §8)', () => {
  it('random months: the summary and the group rows add up to splitMonthCharges exactly', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { rows, balances } = randomMonth(seed);
      for (const branchIds of [null, [1]] as ReportBranchIds[]) {
        const input = { month: '2026-10', branchIds, rows, balances };
        const total = splitMonthCharges(input);
        const charges: GpCharge[] = splitMonthChargesByCharge(input).map(
          (s) => ({
            ...s,
            enrollmentStatus: 'ACTIVE' as const,
            enrollmentCreatedAt: new Date(0),
          }),
        );
        const d = data(
          charges,
          [...new Set(charges.map((c) => c.groupId))].map((id) => group(id)),
        );
        const s = summarize(d);
        expect({
          seed,
          charged: s.charged,
          paid: s.paid,
          unpaid: s.unpaid,
          paidPct: s.paidPct,
          students: s.students,
          unpaidStudents: s.unpaidStudents,
        }).toEqual({
          seed,
          charged: total.charged,
          paid: total.paid,
          unpaid: total.unpaid,
          paidPct: total.paidPct,
          students: total.students,
          unpaidStudents: total.unpaidStudents,
        });
        const g = groupRows(d);
        expect(g.reduce((a, r) => a + r.unpaid, 0)).toBe(total.unpaid);
        expect(g.reduce((a, r) => a + r.charged, 0)).toBe(total.charged);
      }
    }
  });
});
