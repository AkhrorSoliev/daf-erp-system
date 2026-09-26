import { buildMonths } from './statement-months';
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
const pay = (day: string, amount: number): StatementRow =>
  row({
    type: 'PAYMENT',
    day,
    amount,
    enrollmentId: null,
    paymentId: `p-${day}`,
    paymentMethod: 'CASH',
  });
/** A package of `days.length` held lessons (or `capacity` if more were paid). */
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
  student: {
    id: 1,
    name: 'Test Student',
    firstName: 'Test',
    lastName: 'Student',
    balance: 0,
    discountPercent: 0,
  },
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

describe('buildMonths', () => {
  it('puts each package lesson in the month it was held', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 0,
          discountPercent: 0,
        },
        rows: [
          pay('2026-08-01', 360_000),
          pack('2026-08-01', 360_000, [
            ...AUG.slice(0, 10),
            '2026-09-03',
            '2026-09-05',
          ]),
        ],
      }),
    );
    expect(r.months.map((m) => [m.key, m.lessons, m.cost])).toEqual([
      ['2026-08', 10, 300_000],
      ['2026-09', 2, 60_000],
    ]);
    expect(r.unexplained).toBe(0);
  });

  it('bills a monthly charge to its period and lists its lesson days', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: -450_000,
          discountPercent: 0,
        },
        rows: [monthly('2026-09', 450_000, 12, 12)],
        charges: [sept()],
      }),
    );
    const m = r.months[0];
    expect([m.key, m.lessons, m.cost, m.model]).toEqual([
      '2026-09',
      12,
      450_000,
      'MONTHLY',
    ]);
    expect(m.monthlyParts[0]).toMatchObject({
      group: '#036',
      lessons: 12,
      planned: 12,
      perLesson: 37_500,
      fromDay: null,
    });
    expect(m.lessonDays).toHaveLength(12);
  });

  it('records a mid-month start', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: -262_500,
          discountPercent: 0,
        },
        rows: [monthly('2026-09', 262_500, 7, 12)],
        charges: [sept({ coveredDates: SEPT.slice(5) })],
      }),
    );
    expect(r.months[0].monthlyParts[0]).toMatchObject({
      lessons: 7,
      planned: 12,
      perLesson: 37_500,
      fromDay: '2026-09-15',
    });
  });

  it('skips reversed pairs and keeps the switch reversal as a fact of the month', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 0,
          discountPercent: 0,
        },
        rows: [
          pay('2026-09-16', 450_000),
          row({
            type: 'LESSON_DEDUCTION',
            day: '2026-09-16',
            amount: -450_000,
            reversed: true,
            metadata: { lessonsCovered: 12 },
            consumedDays: SEPT.slice(6, 9),
          }),
          row({
            type: 'LESSON_DEDUCTION',
            day: '2026-09-26',
            amount: 450_000,
            reversal: true,
            description:
              "Bekor qilindi: Oylik to'lovga o'tish migratsiyasi — 2026-09",
          }),
          monthly('2026-09', 450_000, 12, 12),
        ],
        charges: [sept()],
      }),
    );
    expect(r.months[0].lessons).toBe(12);
    expect(r.switchFacts.get('2026-09')?.oldCharged).toBe(450_000);
    expect(r.unexplained).toBe(0);
  });

  it('takes a lesson the monthly charge covers again off the old-way part', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 30_000,
          discountPercent: 0,
        },
        rows: [
          pay('2026-08-01', 360_000),
          pack('2026-08-01', 360_000, [...AUG.slice(0, 11), '2026-09-03']),
          monthly('2026-09', 450_000, 12, 12),
          pay('2026-09-10', 450_000),
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
    const september = r.months.find((m) => m.key === '2026-09')!;
    expect([september.lessons, september.cost]).toEqual([12, 450_000]);
    expect(september.packParts).toEqual([]);
    expect(r.switchFacts.get('2026-09')?.carriedIn).toEqual({
      lessons: 1,
      amount: 30_000,
    });
    expect(r.months.map((m) => m.running)).toEqual([30_000, 30_000]);
  });

  it('cancels one exact lesson when the credit names its day (a re-join)', () => {
    const r = buildMonths(
      input({
        enrollments: [
          enr({ id: 'old', end: '2026-09-03', status: 'DROPPED' }),
          enr({ id: 'e1', start: '2026-09-03' }),
        ],
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: -225_000,
          discountPercent: 0,
        },
        rows: [
          row({
            type: 'LESSON_DEDUCTION',
            day: '2026-09-03',
            amount: -18_750,
            enrollmentId: 'old',
            metadata: {
              mode: 'SINGLE_UNCOVERED',
              perLessonCost: 37_500,
              lessonsCovered: 1,
            },
            consumedDays: ['2026-09-03'],
          }),
          monthly('2026-09', 225_000, 12, 12),
          row({
            type: 'ADJUSTMENT',
            day: '2026-09-26',
            amount: 18_750,
            enrollmentId: null,
            metadata: {
              marker: 'overcharge-monthly-carried-in',
              period: '2026-09',
              enrollmentId: 'e1',
              oldEnrollmentId: 'old',
              lessonDate: '2026-09-03',
              lessons: 1,
            },
          }),
        ],
        charges: [sept()],
      }),
    );
    expect(r.months[0].lessons).toBe(12);
    expect(
      r.months[0].lessonDays.filter((d) => d.day === '2026-09-03'),
    ).toHaveLength(1);
  });

  it('folds a tagged monthly release into the month and says so', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 0,
          discountPercent: 0,
        },
        rows: [
          pay('2026-09-02', 300_000),
          monthly('2026-09', 450_000, 12, 12),
          row({
            type: 'ADJUSTMENT',
            day: '2026-09-20',
            amount: 150_000,
            enrollmentId: null,
            description: "Guruhdan chiqarilganda — o'tmagan 4 dars qaytarildi",
            metadata: {
              kind: 'monthly-release',
              period: '2026-09',
              lessons: 4,
            },
          }),
        ],
        charges: [sept({ frozenOutDates: SEPT.slice(8) })],
      }),
    );
    const m = r.months[0];
    expect([m.lessons, m.cost]).toEqual([8, 300_000]);
    expect(m.notes).toEqual([
      {
        day: '2026-09-20',
        kind: 'monthly-release',
        why: 'left-group',
        lessons: 4,
        amount: 150_000,
      },
    ]);
    expect(m.lessonDays).toHaveLength(8);
  });

  it('reads an untagged package release from its text and estimates the lessons', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 90_000,
          discountPercent: 0,
        },
        rows: [
          pay('2026-07-01', 360_000),
          pack(
            '2026-07-01',
            360_000,
            [
              '2026-07-02',
              '2026-07-04',
              '2026-07-07',
              '2026-07-09',
              '2026-07-11',
              '2026-07-14',
              '2026-07-16',
              '2026-07-18',
              '2026-07-21',
            ],
            12,
          ),
          row({
            type: 'ADJUSTMENT',
            day: '2026-07-23',
            amount: 90_000,
            enrollmentId: null,
            description:
              'Guruhdan chiqarilganda qoldiq darslar uchun balans tiklash',
          }),
        ],
      }),
    );
    const m = r.months[0];
    expect([m.lessons, m.cost]).toEqual([9, 270_000]);
    expect(m.notes[0]).toEqual({
      day: '2026-07-23',
      kind: 'prepaid-release',
      why: 'left-group',
      lessons: 3,
      amount: 90_000,
    });
    expect([r.prepaidAhead, r.unexplained]).toEqual([0, 0]);
  });

  it('keeps unreturned package lessons as paid ahead', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 0,
          discountPercent: 0,
        },
        rows: [
          pay('2026-07-01', 360_000),
          pack(
            '2026-07-01',
            360_000,
            ['2026-07-02', '2026-07-04', '2026-07-07'],
            12,
          ),
        ],
      }),
    );
    expect(r.prepaidAhead).toBe(270_000);
    expect(r.unexplained).toBe(0);
  });

  it('treats the April cutover refund as lessons paid before the system', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 0,
          discountPercent: 0,
        },
        rows: [
          pack(
            '2026-04-25',
            120_000,
            ['2026-04-23', '2026-04-25', '2026-04-28', '2026-04-30'],
            4,
          ),
          row({
            type: 'ADJUSTMENT',
            day: '2026-06-06',
            amount: 120_000,
            enrollmentId: null,
            metadata: { marker: 'april-cutover-refund' },
          }),
        ],
      }),
    );
    const april = r.months.find((m) => m.key === '2026-04')!;
    expect([april.lessons, april.cost, april.preSystem]).toEqual([
      0,
      0,
      { lessons: 4, amount: 120_000 },
    ]);
  });

  it('shows money that is not a payment as a dated item', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 0,
          discountPercent: 0,
        },
        rows: [
          pay('2026-09-05', 400_000),
          pay('2026-09-11', 400_000),
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
    const m = r.months[0];
    expect(m.items).toEqual([
      {
        day: '2026-09-24',
        kind: 'refund',
        amount: -400_000,
        description: null,
      },
    ]);
    expect([m.paid, m.money, m.running]).toEqual([800_000, 400_000, 0]);
  });

  it('adds any difference from the balance as an unexplained item', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 90_000,
          discountPercent: 0,
        },
        rows: [pay('2026-09-05', 100_000)],
      }),
    );
    expect(r.unexplained).toBe(-10_000);
    expect(r.months[0].items).toEqual([
      {
        day: '2026-09-26',
        kind: 'unexplained',
        amount: -10_000,
        description: null,
      },
    ]);
    expect(r.months[0].running).toBe(90_000);
  });

  it('calls a difference of a few som rounding, not unexplained', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 100_001,
          discountPercent: 0,
        },
        rows: [pay('2026-09-05', 100_000)],
      }),
    );
    expect(r.unexplained).toBe(0);
    expect(r.months[0].items).toEqual([
      { day: '2026-09-26', kind: 'rounding', amount: 1, description: null },
    ]);
  });

  it('does not take a correction that only mentions freezing for a release', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 0,
          discountPercent: 0,
        },
        rows: [
          row({
            type: 'ADJUSTMENT',
            day: '2026-06-10',
            amount: 400_000,
            enrollmentId: null,
            description:
              "Balans tuzatildi: 400 000 so'm to'lov (24.04) 01.05 dan hisoblanadi — aprel darslari muzlatilgan.",
          }),
          pack('2026-06-10', 400_000, SEPT.slice(0, 12), 12),
        ],
      }),
    );
    expect(r.months[0].items.map((i) => i.kind)).toEqual(['correction']);
    expect(r.months.flatMap((m) => m.notes)).toEqual([]);
  });

  it('knows the old release texts, including the manual counter fix', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 0,
          discountPercent: 0,
        },
        rows: [
          row({
            type: 'ADJUSTMENT',
            day: '2026-07-10',
            amount: 30_000,
            enrollmentId: null,
            description: "O'quvchi muzlatildi",
          }),
          row({
            type: 'ADJUSTMENT',
            day: '2026-07-11',
            amount: 30_000,
            enrollmentId: null,
            description:
              "Qoldiq oldindan to'langan darslar balansga qaytarildi (Cascade: Student #1 → EXPELLED)",
          }),
          row({
            type: 'ADJUSTMENT',
            day: '2026-07-12',
            amount: 30_000,
            enrollmentId: null,
            description:
              "Oylik to'lovga o'tish migratsiyasi — 2026-09 — oldindan to'langan darslar balansga qaytarildi",
          }),
          row({
            type: 'ADJUSTMENT',
            day: '2026-07-13',
            amount: 30_000,
            enrollmentId: null,
            description:
              "18.08.2026 dagi pul qaytarish shu darslarni qoplagan edi — o'shanda hisoblagich kamaytirilmagan",
          }),
          pack('2026-07-01', 120_000, [], 4),
        ],
      }),
    );
    expect(r.months[0].notes.map((n) => [n.kind, n.why])).toEqual([
      ['prepaid-release', 'frozen'],
      ['prepaid-release', 'expelled'],
      ['prepaid-release', 'switch'],
      ['prepaid-release', 'refund'],
    ]);
    expect([r.prepaidAhead, r.unexplained]).toEqual([0, 0]);
  });

  it('frees package lessons the replay re-dated onto days a monthly charge covers', () => {
    // A freeze returned 3 unused package lessons (90 000), but the replay
    // filled their places with September lessons whose own charges the
    // switch reversed. Those days are paid by the monthly charge.
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: 90_000,
          discountPercent: 0,
        },
        rows: [
          pay('2026-07-01', 360_000),
          pack('2026-07-01', 360_000, [
            '2026-07-02',
            '2026-07-04',
            '2026-07-07',
            '2026-07-09',
            '2026-07-11',
            '2026-07-14',
            '2026-07-16',
            '2026-07-18',
            '2026-07-21',
            '2026-09-03',
            '2026-09-05',
            '2026-09-08',
          ]),
          row({
            type: 'ADJUSTMENT',
            day: '2026-07-25',
            amount: 90_000,
            enrollmentId: null,
            description: "O'quvchi muzlatildi",
          }),
          pay('2026-09-10', 450_000),
          monthly('2026-09', 450_000, 12, 12),
        ],
        charges: [sept()],
      }),
    );
    const september = r.months.find((m) => m.key === '2026-09')!;
    expect([september.lessons, september.cost]).toEqual([12, 450_000]);
    expect(september.packParts).toEqual([]);
    expect([r.prepaidAhead, r.unexplained]).toEqual([0, 0]);
  });

  it('leaves an overlap nothing explains in sight', () => {
    // No returned money to match: the extra lesson stays counted, so the
    // statement shows it instead of hiding a real double charge.
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: -480_000,
          discountPercent: 0,
        },
        rows: [
          pack('2026-09-01', 30_000, ['2026-09-03'], 1),
          monthly('2026-09', 450_000, 12, 12),
        ],
        charges: [sept()],
      }),
    );
    expect(r.months[0].lessons).toBe(13);
    expect(r.unexplained).toBe(0);
  });

  it('fills quiet months between active ones', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: -330_000,
          discountPercent: 0,
        },
        rows: [
          pack('2026-07-01', 90_000, [
            '2026-07-02',
            '2026-07-04',
            '2026-07-07',
          ]),
          monthly('2026-09', 240_000, 6, 12),
        ],
        charges: [sept({ coveredDates: SEPT.slice(6) })],
      }),
    );
    expect(r.months.map((m) => [m.key, m.lessons])).toEqual([
      ['2026-07', 3],
      ['2026-08', 0],
      ['2026-09', 6],
    ]);
  });

  it('marks lesson days from attendance and counts unexcused absences', () => {
    const r = buildMonths(
      input({
        student: {
          id: 1,
          name: 'S',
          firstName: 'Test',
          lastName: 'Student',
          balance: -450_000,
          discountPercent: 0,
        },
        rows: [monthly('2026-09', 450_000, 12, 12)],
        charges: [sept()],
        attendance: [
          { day: '2026-09-03', group: '#036', status: 'PRESENT' },
          { day: '2026-09-05', group: '#036', status: 'ABSENT' },
          { day: '2026-09-08', group: '#036', status: 'EXCUSED' },
          { day: '2026-09-10', group: '#036', status: 'LATE' },
        ],
      }),
    );
    const days = r.months[0].lessonDays;
    expect(days.slice(0, 5).map((d) => d.status)).toEqual([
      'keldi',
      'kelmagan',
      'uzrli',
      'keldi',
      'belgilanmagan',
    ]);
    expect(days[days.length - 1].status).toBe('kelgusi');
    expect(r.months[0].absent).toBe(1);
  });
});
