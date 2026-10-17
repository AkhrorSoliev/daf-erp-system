import { excusedCredit, excusedMonthly } from './attendance-credit';
import type {
  AttRow,
  ChargeFact,
  CreditSetting,
  GroupFact,
} from './attendance-stats.types';

const SEPT = { from: '2026-09-01', to: '2026-10-01' };
const group = (id: string, branchId: number, monthly = true): GroupFact => ({
  id,
  name: id,
  branchId,
  deleted: false,
  courseId: 'c1',
  courseName: 'Standart',
  monthly,
  teacherId: 7,
  teacherName: 'Otabek Sobirov',
});
const GROUPS = new Map([
  ['g1', group('g1', 1)],
  ['g2', group('g2', 2)],
  ['g3', group('g3', 1, false)],
]);
const ex = (
  studentId: number,
  groupId: string,
  date: string,
  over: Partial<AttRow> = {},
): AttRow => ({
  groupId,
  studentId,
  date,
  status: 'EXCUSED',
  cancelled: false,
  ...over,
});
const ROWS: AttRow[] = [
  ex(1, 'g1', '2026-09-02'),
  ex(1, 'g1', '2026-09-04'),
  ex(1, 'g1', '2026-09-07'),
  ex(2, 'g1', '2026-09-02'),
  ex(3, 'g2', '2026-09-02'),
  ex(3, 'g2', '2026-09-03'),
  ex(4, 'g3', '2026-09-02'), // a pack course: not in the block
  ex(5, 'g1', '2026-09-02', { cancelled: true }), // the centre cancelled: not «Sababli»
  ex(6, 'g1', '2026-10-01'), // outside the window
  { ...ex(7, 'g1', '2026-09-02'), status: 'ABSENT' },
];
const CHARGES: ChargeFact[] = [
  {
    studentId: 1,
    groupId: 'g1',
    month: '2026-09',
    perLessonCost: 34_615,
    discountPercent: 10,
  },
  {
    studentId: 3,
    groupId: 'g2',
    month: '2026-09',
    perLessonCost: 30_000,
    discountPercent: 0,
  },
];
const set = (b1: CreditSetting, b2: CreditSetting) =>
  new Map([
    [1, b1],
    [2, b2],
  ]);

describe('excusedMonthly', () => {
  it('keeps «Sababli» marks of monthly-course groups inside the window only', () => {
    expect(excusedMonthly(ROWS, SEPT, GROUPS).map((r) => r.studentId)).toEqual([
      1, 1, 1, 2, 3, 3,
    ]);
  });
});

describe('excusedCredit', () => {
  const excused = excusedMonthly(ROWS, SEPT, GROUPS);

  it('caps per student, group and month and applies the frozen discount', () => {
    const r = excusedCredit(
      excused,
      GROUPS,
      CHARGES,
      set({ enabled: true, cap: 2 }, { enabled: false, cap: null }),
    );
    // student 1: min(3, 2) × round(34 615 × 0.9) = 2 × 31 154; student 2: no charge; student 3: branch 2 is off
    expect(r).toEqual({
      lessons: 6,
      students: 3,
      amount: 62_308,
      enabled: true,
      uncharged: 1,
    });
  });

  it('no cap: every excused lesson counts', () => {
    const r = excusedCredit(
      excused,
      GROUPS,
      CHARGES,
      set({ enabled: true, cap: null }, { enabled: true, cap: null }),
    );
    expect(r.amount).toBe(3 * 31_154 + 2 * 30_000);
  });

  it("the setting off everywhere: no amount, «o'chirilgan»", () => {
    const r = excusedCredit(
      excused,
      GROUPS,
      CHARGES,
      set({ enabled: false, cap: null }, { enabled: false, cap: null }),
    );
    expect(r).toEqual({
      lessons: 6,
      students: 3,
      amount: null,
      enabled: false,
      uncharged: 1,
    });
  });

  it('a branch without a setting counts as off — never invented money', () => {
    const r = excusedCredit(excused, GROUPS, CHARGES, new Map());
    expect(r.amount).toBeNull();
  });

  it('each month is capped on its own and the months add up', () => {
    const rows = [
      ex(1, 'g1', '2026-09-02'),
      ex(1, 'g1', '2026-09-03'),
      ex(1, 'g1', '2026-10-02'),
      ex(1, 'g1', '2026-10-05'),
    ];
    const charges = [CHARGES[0], { ...CHARGES[0], month: '2026-10' }];
    const r = excusedCredit(
      rows,
      GROUPS,
      charges,
      set({ enabled: true, cap: 1 }, { enabled: true, cap: null }),
    );
    expect(r.amount).toBe(2 * 31_154);
  });

  it("nothing excused: zero lessons, zero money, not «o'chirilgan»", () => {
    expect(excusedCredit([], GROUPS, [], new Map())).toEqual({
      lessons: 0,
      students: 0,
      amount: 0,
      enabled: true,
      uncharged: 0,
    });
  });
});
