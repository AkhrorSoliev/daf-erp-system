import type { DebtRow } from '../../reports/debt-split';
import {
  drawerMonths,
  filterDebtRows,
  filterOptions,
  groupsOf,
  promiseCell,
  sortDebtRows,
  toListRow,
  type DebtListRow,
  type EnrollmentFact,
} from './debt-list.math';

const group = (
  id: string,
  teacherId: number,
  over: Partial<EnrollmentFact['group']> = {},
) => ({
  id,
  name: `G-${id}`,
  deletedAt: null,
  statusEnum: 'ACTIVE',
  teachers: [
    { teacher: { id: teacherId, firstName: 'U', lastName: String(teacherId) } },
  ],
  ...over,
});
const row = (over: Partial<DebtListRow>): DebtListRow => ({
  studentId: 10001,
  firstName: 'Ali',
  lastName: 'Valiyev',
  phone: '901112233',
  amount: 100_000,
  otherPart: 0,
  debt: 100_000,
  kind: null,
  groups: [],
  promise: null,
  months: [],
  oldestMonth: null,
  ...over,
});

describe('promiseCell', () => {
  const p = (
    status: string,
    iso: string,
    promisedAmount: number | null = null,
  ) => ({ status, promiseDate: new Date(iso), promisedAmount });
  it('OPEN with a day ahead is open; BROKEN is broken; anything else is no promise', () => {
    expect(
      promiseCell(p('OPEN', '2026-10-16T18:00:00Z', 5), '2026-10-14'),
    ).toEqual({ state: 'open', promiseDate: '2026-10-16', promisedAmount: 5 });
    expect(
      promiseCell(p('OPEN', '2026-10-13T10:00:00Z'), '2026-10-14'),
    ).toBeNull();
    expect(
      promiseCell(p('BROKEN', '2026-10-09T18:59:59Z'), '2026-10-14'),
    ).toEqual({
      state: 'broken',
      promiseDate: '2026-10-09',
      promisedAmount: null,
    });
    expect(
      promiseCell(p('KEPT', '2026-10-16T18:00:00Z'), '2026-10-14'),
    ).toBeNull();
    expect(promiseCell(null, '2026-10-14')).toBeNull();
  });
});

describe('groupsOf', () => {
  const facts: EnrollmentFact[] = [
    { status: 'ACTIVE', group: group('g2', 2) },
    { status: 'DROPPED', group: group('g1', 1) },
    { status: 'ACTIVE', group: group('g3', 3, { statusEnum: 'COMPLETED' }) },
  ];
  it('studying: live ACTIVE enrollments in live ACTIVE groups, with their teachers', () => {
    expect(groupsOf(null, facts)).toEqual([
      { id: 'g2', name: 'G-g2', teachers: [{ id: 2, name: 'U 2' }] },
    ]);
  });
  it('not studying: the latest enrollment, whatever its status; none without one', () => {
    expect(groupsOf('left', facts).map((g) => g.id)).toEqual(['g2']);
    expect(groupsOf('ungrouped', [])).toEqual([]);
  });
});

describe('toListRow', () => {
  const debt: DebtRow = {
    studentId: 10001,
    debt: 500_000,
    currentMonth: 450_000,
    older: 50_000,
    kind: null,
  };
  const facts = {
    student: { firstName: 'Ali', lastName: 'Valiyev', phone: null },
    groups: [],
    promise: null,
    ageMonths: { '2026-10': 450_000, '2026-08': 20_000, '2026-09': 30_000 },
    currentMonth: '2026-10',
  };
  it("takes the tab's part and names the other studying part for the pill", () => {
    expect(toListRow(debt, 'shu-oy', facts)).toMatchObject({
      amount: 450_000,
      otherPart: 50_000,
      debt: 500_000,
    });
    expect(toListRow(debt, 'eski', facts)).toMatchObject({
      amount: 50_000,
      otherPart: 450_000,
    });
    expect(
      toListRow({ ...debt, kind: 'frozen' }, 'chiqqan', facts),
    ).toMatchObject({ amount: 500_000, otherPart: 0 });
  });
  it('Eski qarz shows only the months before the current one; the oldest month is kept for the sort', () => {
    const r = toListRow(debt, 'eski', facts);
    expect(r.months).toEqual([
      { monthKey: '2026-08', amount: 20_000 },
      { monthKey: '2026-09', amount: 30_000 },
    ]);
    expect(r.oldestMonth).toBe('2026-08');
    expect(
      toListRow(debt, 'shu-oy', { ...facts, ageMonths: null }),
    ).toMatchObject({ months: [], oldestMonth: null });
  });
});

describe('filterDebtRows', () => {
  const rows = [
    row({
      studentId: 10001,
      groups: [{ id: 'g1', name: 'A', teachers: [{ id: 1, name: 'T1' }] }],
    }),
    row({
      studentId: 10002,
      firstName: 'Vali',
      lastName: 'Aliyev',
      phone: '907778899',
      kind: 'frozen',
      promise: {
        state: 'broken',
        promiseDate: '2026-10-09',
        promisedAmount: null,
      },
      groups: [{ id: 'g2', name: 'B', teachers: [{ id: 2, name: 'T2' }] }],
    }),
  ];
  const ids = (f: Parameters<typeof filterDebtRows>[1]) =>
    filterDebtRows(rows, f).map((r) => r.studentId);
  it('search is a name, the phone or the exact id — the student list rule', () => {
    expect(ids({ search: 'VALI' })).toEqual([10001, 10002]);
    expect(ids({ search: '77788' })).toEqual([10002]);
    expect(ids({ search: '10001' })).toEqual([10001]);
    expect(ids({ search: '1000' })).toEqual([]);
  });
  it('kind, groups, teachers and the promise state', () => {
    expect(ids({ kind: 'frozen' })).toEqual([10002]);
    expect(ids({ groupIds: ['g1'] })).toEqual([10001]);
    expect(ids({ teacherIds: [2] })).toEqual([10002]);
    expect(ids({ promise: 'broken' })).toEqual([10002]);
    expect(ids({ promise: 'none' })).toEqual([10001]);
    expect(ids({ promise: 'open' })).toEqual([]);
  });
});

describe('sortDebtRows', () => {
  const a = row({
    studentId: 1,
    firstName: 'Zarina',
    amount: 300,
    oldestMonth: '2026-09',
  });
  const b = row({
    studentId: 2,
    firstName: 'Anvar',
    amount: 900,
    oldestMonth: null,
    promise: {
      state: 'broken',
      promiseDate: '2026-10-01',
      promisedAmount: null,
    },
  });
  const c = row({
    studentId: 3,
    firstName: 'Bobur',
    amount: 500,
    oldestMonth: '2026-07',
  });
  const order = (s: Parameters<typeof sortDebtRows>[1]) =>
    sortDebtRows([a, b, c], s).map((r) => r.studentId);
  it('largest debt first; oldest month first (undated last); broken first; by name', () => {
    expect(order('debt')).toEqual([2, 3, 1]);
    expect(order('oldest')).toEqual([3, 1, 2]);
    expect(order('broken')).toEqual([2, 3, 1]);
    expect(order('name')).toEqual([2, 3, 1]);
  });
});

describe('filterOptions', () => {
  it("lists the tab's own groups and teachers once each, by name", () => {
    const g = (id: string, t: number) => ({
      id,
      name: id.toUpperCase(),
      teachers: [{ id: t, name: `T${t}` }],
    });
    expect(
      filterOptions([
        row({ groups: [g('b', 2)] }),
        row({ groups: [g('a', 1), g('b', 2)] }),
      ]),
    ).toEqual({
      groups: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      teachers: [
        { id: 1, name: 'T1' },
        { id: 2, name: 'T2' },
      ],
    });
  });
});

describe('drawerMonths', () => {
  it("reads the statement's own allocation: charged, paid by payments, left — oldest first", () => {
    const model = {
      asOf: '2026-10-14',
      months: [
        { key: '2026-09', cost: 450_000 },
        { key: '2026-10', cost: 450_000 },
      ],
      allocations: [
        {
          kind: 'payment',
          to: [{ due: { kind: 'month', month: '2026-09' }, amount: 300_000 }],
        },
        {
          kind: 'credit',
          to: [{ due: { kind: 'month', month: '2026-09' }, amount: 100_000 }],
        },
      ],
      headline: {
        kind: 'debt',
        amount: 530_000,
        unpaid: [
          {
            due: { kind: 'item', itemKind: 'mockExamFee', day: '2026-08-20' },
            amount: 30_000,
          },
          { due: { kind: 'month', month: '2026-10' }, amount: 450_000 },
          { due: { kind: 'month', month: '2026-09' }, amount: 50_000 },
        ],
      },
    };
    expect(drawerMonths(model as never)).toEqual([
      { month: '2026-08', charged: null, paid: null, left: 30_000 },
      { month: '2026-09', charged: 450_000, paid: 300_000, left: 50_000 },
      { month: '2026-10', charged: 450_000, paid: 0, left: 450_000 },
    ]);
  });
  it('a student who owes nothing has no months', () => {
    expect(
      drawerMonths({
        asOf: '2026-10-14',
        months: [],
        allocations: [],
        headline: { kind: 'credit', amount: 5, unpaid: [] },
      } as never),
    ).toEqual([]);
  });
});
