import { buildStatement } from './build-statement';
import type {
  StatementEnrollment,
  StatementInput,
  StatementRow,
} from './statement.types';

let seq = 0;
/** A row's timestamp defaults to 10:00 Tashkent on its day. */
const withAt = (
  r: Omit<StatementRow, 'at'> & { at?: string },
): StatementRow => ({ ...r, at: r.at ?? `${r.day}T05:00:00.000Z` });
const row = (over: Partial<StatementRow>): StatementRow =>
  withAt({
    id: `t${++seq}`,
    type: 'PAYMENT',
    amount: 0,
    day: '2026-05-01',
    description: null,
    metadata: null,
    enrollmentId: 'e1',
    paymentId: null,
    paymentMethod: null,
    reversed: false,
    reversal: false,
    consumedDays: null,
    ...over,
  });
const pay = (day: string, amount: number, method = 'CASH'): StatementRow =>
  row({
    type: 'PAYMENT',
    day,
    amount,
    enrollmentId: null,
    paymentId: `p-${day}`,
    paymentMethod: method,
  });
const pack = (
  day: string,
  amount: number,
  days: string[],
  capacity = days.length,
  enrollmentId = 'e1',
): StatementRow =>
  row({
    type: 'LESSON_DEDUCTION',
    day,
    amount: -amount,
    enrollmentId,
    metadata: { lessonsCovered: capacity },
    consumedDays: days,
  });
const monthly = (
  period: string,
  amount: number,
  covered: number,
  planned: number,
  enrollmentId = 'e1',
): StatementRow =>
  row({
    type: 'LESSON_DEDUCTION',
    day: `${period}-26`,
    amount: -amount,
    enrollmentId,
    metadata: {
      mode: 'MONTHLY_PERIOD',
      period,
      coveredLessons: covered,
      plannedLessons: planned,
    },
  });
const enr = (over: Partial<StatementEnrollment> = {}): StatementEnrollment => ({
  id: 'e1',
  group: '#036',
  status: 'ACTIVE',
  start: '2026-05-01',
  end: null,
  deleted: false,
  course: {
    name: 'Standart',
    price: 450_000,
    lessonPaymentCount: 12,
    paymentModel: 'MONTHLY',
  },
  branch: 'Filial',
  ...over,
});
const input = (over: Partial<StatementInput>): StatementInput => ({
  asOf: '2026-09-26',
  student: { id: 1, name: 'Test Student', balance: 0, discountPercent: 0 },
  enrollments: [enr()],
  rows: [],
  charges: [],
  attendance: [],
  ...over,
});
const SEPT = [
  '2026-09-03',
  '2026-09-05',
  '2026-09-08',
  '2026-09-10',
  '2026-09-12',
  '2026-09-15',
  '2026-09-17',
  '2026-09-19',
  '2026-09-22',
  '2026-09-24',
  '2026-09-26',
  '2026-09-29',
];
const JULY = [
  '2026-07-02',
  '2026-07-04',
  '2026-07-07',
  '2026-07-09',
  '2026-07-11',
  '2026-07-14',
  '2026-07-16',
  '2026-07-18',
  '2026-07-21',
];
const AUG = [
  '2026-08-01',
  '2026-08-04',
  '2026-08-06',
  '2026-08-08',
  '2026-08-11',
  '2026-08-13',
  '2026-08-15',
  '2026-08-18',
  '2026-08-20',
  '2026-08-22',
  '2026-08-25',
  '2026-08-27',
];
const sept = (over: Record<string, unknown> = {}) => ({
  enrollmentId: 'e1',
  period: '2026-09',
  plannedLessons: 12,
  coveredDates: SEPT,
  frozenOutDates: [] as string[],
  creditLessons: 0,
  creditAmount: 0,
  excusedLessons: 0,
  ...over,
});

describe('buildStatement', () => {
  it('pays the oldest lessons first and carries the rest', () => {
    const s = buildStatement(
      input({
        student: { id: 1, name: 'S', balance: 187_500, discountPercent: 0 },
        enrollments: [enr({ start: '2026-09-15' })],
        rows: [pay('2026-09-16', 450_000), monthly('2026-09', 262_500, 7, 12)],
        charges: [sept({ coveredDates: SEPT.slice(5) })],
      }),
    );
    expect(s.headline).toEqual({ kind: 'credit', amount: 187_500, unpaid: [] });
    expect(s.allocations[0]).toMatchObject({
      kind: 'payment',
      method: 'CASH',
      amount: 450_000,
      leftover: 187_500,
      to: [{ due: { kind: 'month', month: '2026-09' }, amount: 262_500 }],
    });
  });

  it('keeps the exact time of a payment, for the 72-hour correction rule', () => {
    const s = buildStatement(
      input({
        student: { id: 1, name: 'S', balance: 100_000, discountPercent: 0 },
        rows: [
          { ...pay('2026-09-16', 100_000), at: '2026-09-16T09:30:00.000Z' },
        ],
      }),
    );
    expect(s.allocations[0].at).toBe('2026-09-16T09:30:00.000Z');
  });

  it('splits a debt into this month and what is left from before', () => {
    const s = buildStatement(
      input({
        enrollments: [
          enr({
            id: 'e0',
            group: '#041',
            status: 'DROPPED',
            start: '2026-05-01',
            end: '2026-07-23',
          }),
          enr({ id: 'e1', start: '2026-09-19' }),
        ],
        student: { id: 1, name: 'S', balance: -257_500, discountPercent: 0 },
        rows: [
          pack('2026-07-02', 270_000, JULY, 9, 'e0'),
          pay('2026-07-21', 200_000),
          monthly('2026-09', 187_500, 5, 12),
        ],
        charges: [sept({ coveredDates: SEPT.slice(7) })],
      }),
    );
    expect(s.headline.kind).toBe('debt');
    expect(s.headline.amount).toBe(257_500);
    expect(s.headline.unpaid).toEqual([
      { due: { kind: 'month', month: '2026-09' }, amount: 187_500 },
      { due: { kind: 'month', month: '2026-07' }, amount: 70_000 },
    ]);
  });

  it('explains a sharp change: lessons, price, a return after a gap, the new model', () => {
    const s = buildStatement(
      input({
        enrollments: [
          enr({
            id: 'e0',
            group: '#041',
            status: 'DROPPED',
            start: '2026-05-01',
            end: '2026-07-23',
          }),
          enr({ id: 'e1', start: '2026-09-19' }),
        ],
        student: { id: 1, name: 'S', balance: -257_500, discountPercent: 0 },
        rows: [
          pack('2026-07-02', 270_000, JULY, 9, 'e0'),
          pay('2026-07-21', 200_000),
          monthly('2026-09', 187_500, 5, 12),
        ],
        charges: [sept({ coveredDates: SEPT.slice(7) })],
      }),
    );
    const september = s.months[s.months.length - 1];
    expect(september.sharp).toEqual({
      vs: '2026-07',
      diff: -82_500,
      reasons: [
        { kind: 'lessons', now: 5, before: 9 },
        { kind: 'price', now: 37_500, before: 30_000 },
        {
          kind: 'joined',
          day: '2026-09-19',
          group: '#036',
          awaySince: '2026-07-23',
        },
        { kind: 'model', to: 'MONTHLY' },
      ],
    });
  });

  it('says a group change mid-month and ignores a same-day open and close', () => {
    const s = buildStatement(
      input({
        enrollments: [
          enr({
            id: 'e0',
            group: '#001',
            status: 'DROPPED',
            start: '2026-05-01',
            end: '2026-09-05',
          }),
          enr({
            id: 'e2',
            group: '#057',
            status: 'DROPPED',
            start: '2026-09-16',
            end: '2026-09-16',
          }),
          enr({ id: 'e1', group: '#052', start: '2026-09-16' }),
        ],
        student: { id: 1, name: 'S', balance: -279_808, discountPercent: 0 },
        rows: [
          pay('2026-08-01', 360_000),
          pack('2026-08-01', 360_000, AUG, 12, 'e0'),
          row({
            type: 'LESSON_DEDUCTION',
            day: '2026-09-02',
            amount: -37_500,
            enrollmentId: 'e0',
            metadata: { lessonsCovered: 1 },
            consumedDays: ['2026-09-02'],
          }),
          monthly('2026-09', 242_308, 7, 13),
        ],
        charges: [
          sept({
            plannedLessons: 13,
            coveredDates: SEPT.slice(6, 11).concat([
              '2026-09-29',
              '2026-09-30',
            ]),
          }),
        ],
      }),
    );
    const september = s.months[s.months.length - 1];
    expect(september.sharp?.reasons).toEqual([
      { kind: 'lessons', now: 8, before: 12 },
      { kind: 'price', now: 34_615, before: 30_000 },
      { kind: 'left', day: '2026-09-05', group: '#001', frozen: false },
      { kind: 'joined', day: '2026-09-16', group: '#052', awaySince: null },
      { kind: 'model', to: 'MONTHLY' },
    ]);
    expect(s.modelChanges[0].otherGroupPack).toEqual([
      {
        group: '#001',
        days: ['2026-09-02'],
        cost: 37_500,
        leftDay: '2026-09-05',
      },
    ]);
  });

  it('does not call a small change sharp', () => {
    const s = buildStatement(
      input({
        student: { id: 1, name: 'S', balance: -18_750, discountPercent: 0 },
        rows: [
          pay('2026-08-01', 432_000),
          pack('2026-08-01', 432_000, AUG, 12),
          pay('2026-09-10', 431_250),
          monthly('2026-09', 450_000, 12, 12),
        ],
        charges: [sept()],
      }),
    );
    expect(s.months[s.months.length - 1].sharp).toBeNull();
  });

  it('describes the switch to monthly billing, with what was reversed and credited', () => {
    const s = buildStatement(
      input({
        student: { id: 1, name: 'S', balance: 30_000, discountPercent: 0 },
        rows: [
          pay('2026-08-01', 360_000),
          pack('2026-08-01', 360_000, [...AUG.slice(0, 11), '2026-09-03']),
          pay('2026-09-10', 450_000),
          row({
            type: 'LESSON_DEDUCTION',
            day: '2026-09-10',
            amount: -360_000,
            reversed: true,
            metadata: { lessonsCovered: 12 },
            consumedDays: SEPT.slice(1, 4),
          }),
          row({
            type: 'LESSON_DEDUCTION',
            day: '2026-09-26',
            amount: 360_000,
            reversal: true,
            description:
              "Bekor qilindi: Oylik to'lovga o'tish migratsiyasi — 2026-09",
          }),
          monthly('2026-09', 450_000, 12, 12),
          row({
            type: 'ADJUSTMENT',
            day: '2026-09-26',
            amount: 30_000,
            enrollmentId: null,
            metadata: {
              marker: 'overcharge-monthly-carried-in',
              period: '2026-09',
              enrollmentId: 'e1',
              lessons: 1,
            },
          }),
        ],
        charges: [sept()],
      }),
    );
    expect(s.modelChanges).toEqual([
      {
        month: '2026-09',
        to: 'MONTHLY',
        oldCharged: 360_000,
        newCharged: 450_000,
        newLessons: 12,
        carriedIn: { lessons: 1, amount: 30_000 },
        otherGroupPack: [],
      },
    ]);
    expect(s.packEra).toEqual({ size: 12, until: '2026-09' });
  });

  it('sees a return to lesson packs as a model change of its own', () => {
    const OCT = [
      '2026-10-01',
      '2026-10-03',
      '2026-10-06',
      '2026-10-08',
      '2026-10-10',
      '2026-10-13',
      '2026-10-15',
      '2026-10-17',
      '2026-10-20',
      '2026-10-22',
      '2026-10-24',
      '2026-10-27',
    ];
    const s = buildStatement(
      input({
        asOf: '2026-10-28',
        enrollments: [
          enr({
            course: {
              name: 'Standart',
              price: 400_000,
              lessonPaymentCount: 12,
              paymentModel: 'LESSON_PACK',
            },
          }),
        ],
        student: { id: 1, name: 'S', balance: 0, discountPercent: 0 },
        rows: [
          pay('2026-09-02', 450_000),
          monthly('2026-09', 450_000, 12, 12),
          pay('2026-10-01', 360_000),
          pack('2026-10-01', 360_000, OCT),
        ],
        charges: [sept()],
      }),
    );
    expect(s.modelChanges.map((c) => [c.month, c.to])).toEqual([
      ['2026-10', 'LESSON_PACK'],
    ]);
    expect(s.packEra).toEqual({ size: 12, until: null });
  });

  it('lets a credit such as a forgiven debt pay old lessons', () => {
    const s = buildStatement(
      input({
        student: { id: 1, name: 'S', balance: 138_462, discountPercent: 0 },
        rows: [
          pack('2026-05-10', 180_000, [
            '2026-05-12',
            '2026-05-14',
            '2026-05-16',
            '2026-05-19',
            '2026-05-21',
            '2026-05-23',
          ]),
          row({
            type: 'DEBT_WRITE_OFF',
            day: '2026-08-14',
            amount: 180_000,
            enrollmentId: null,
          }),
          pay('2026-09-16', 450_000),
          monthly('2026-09', 311_538, 9, 13),
        ],
        charges: [sept({ plannedLessons: 13, coveredDates: SEPT.slice(3) })],
      }),
    );
    expect(
      s.allocations.map((a) => [a.kind, a.itemKind, a.to, a.leftover]),
    ).toEqual([
      [
        'credit',
        'debt-write-off',
        [{ due: { kind: 'month', month: '2026-05' }, amount: 180_000 }],
        0,
      ],
      [
        'payment',
        null,
        [{ due: { kind: 'month', month: '2026-09' }, amount: 311_538 }],
        138_462,
      ],
    ]);
    expect(s.equation.items).toEqual([
      { kind: 'debt-write-off', amount: 180_000 },
    ]);
  });

  it('pays a cash refund like any other due', () => {
    const s = buildStatement(
      input({
        student: { id: 1, name: 'S', balance: 0, discountPercent: 0 },
        rows: [
          pay('2026-09-05', 400_000),
          pay('2026-09-11', 400_000, 'PAYME'),
          monthly('2026-09', 400_000, 12, 12),
          row({
            type: 'REFUND',
            day: '2026-09-24',
            amount: -400_000,
            enrollmentId: null,
          }),
        ],
        charges: [sept()],
      }),
    );
    expect(s.headline.kind).toBe('zero');
    expect(s.allocations[1].to).toEqual([
      {
        due: { kind: 'item', itemKind: 'refund', day: '2026-09-24' },
        amount: 400_000,
      },
    ]);
  });

  it('describes the student from the active enrollment', () => {
    const s = buildStatement(
      input({
        enrollments: [
          enr({
            id: 'old',
            group: '#001',
            status: 'DROPPED',
            end: '2026-06-01',
          }),
          enr(),
        ],
        student: {
          id: 7,
          name: 'Test Student',
          balance: 0,
          discountPercent: 10,
        },
      }),
    );
    expect(s.student).toEqual({
      id: 7,
      name: 'Test Student',
      groups: ['#036'],
      course: {
        name: 'Standart',
        price: 450_000,
        lessonPaymentCount: 12,
        paymentModel: 'MONTHLY',
      },
      discountPercent: 10,
      branch: 'Filial',
    });
  });
});
