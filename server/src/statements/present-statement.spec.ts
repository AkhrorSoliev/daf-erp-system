import { buildStatement } from './build-statement';
import { presentStatement } from './present-statement';
import { dayName, som, signed } from './statement-text';
import type {
  StatementEnrollment,
  StatementInput,
  StatementRow,
} from './statement.types';

let seq = 0;
const row = (over: Partial<StatementRow>): StatementRow => ({
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

/** A student who left in July, came back on 19.09 and owes for both. */
const debtor = (): StatementInput => ({
  asOf: '2026-09-26',
  student: {
    id: 7,
    name: 'Test Student',
    balance: -257_500,
    discountPercent: 0,
  },
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
  rows: [
    row({
      type: 'LESSON_DEDUCTION',
      day: '2026-07-02',
      amount: -270_000,
      enrollmentId: 'e0',
      metadata: { lessonsCovered: 9 },
      consumedDays: JULY,
    }),
    row({
      type: 'PAYMENT',
      day: '2026-07-21',
      amount: 200_000,
      enrollmentId: null,
      paymentId: 'p1',
      paymentMethod: 'CASH',
    }),
    row({
      type: 'LESSON_DEDUCTION',
      day: '2026-09-26',
      amount: -187_500,
      metadata: {
        mode: 'MONTHLY_PERIOD',
        period: '2026-09',
        coveredLessons: 5,
        plannedLessons: 12,
      },
    }),
  ],
  charges: [
    {
      enrollmentId: 'e1',
      period: '2026-09',
      plannedLessons: 12,
      coveredDates: SEPT.slice(7),
      frozenOutDates: [],
      creditLessons: 0,
      creditAmount: 0,
      excusedLessons: 0,
    },
  ],
  attendance: [{ day: '2026-07-04', group: '#041', status: 'ABSENT' }],
});

describe('statement text helpers', () => {
  it('groups thousands with no-break spaces and uses a real minus', () => {
    expect(som(-254156)).toBe('254\u00a0156');
    expect(signed(-254156)).toBe('−254\u00a0156');
    expect(signed(33345)).toBe('+33\u00a0345');
    expect(signed(0)).toBe('0');
  });

  it('keeps a day and its month on one line', () => {
    expect(dayName('2026-09-19')).toBe('19\u2011sentabr');
  });
});

describe('presentStatement', () => {
  const nb = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\u2011/g, '-');

  it('answers a debtor in the student voice, month by month', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(nb(v.answer.title)).toBe("Qarzingiz: 257 500 so'm");
    expect(nb(v.answer.subtitle)).toBe(
      'sentabr darslari uchun 187 500 · iyuldan qolgan 70 000',
    );
    expect(nb(v.studentLine)).toBe(
      "Test Student · ID 7 · #036 guruh · Standart — oyiga 450 000 so'm",
    );
    expect(v.asOfLine).toBe('DaF Sprachzentrum · 26.09.2026 holatiga');
  });

  it('answers the same debtor in the admin voice', () => {
    const v = presentStatement(buildStatement(debtor()), 'admin');
    expect(nb(v.answer.title)).toBe("Qarzi: 257 500 so'm");
    expect(nb(v.equation.map((s) => s.text).join(''))).toBe(
      "To'lagan 200 000 − o'qigan darslari 457 500 = −257 500",
    );
  });

  it('writes the months table with quiet months, absences and the monthly line', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(
      v.months.map((m) => [m.label, m.lessons, m.absent, m.cost, m.costNote]),
    ).toEqual([
      ['Iyul', '9 ta', '1 kelmagan', '270\u00a0000', null],
      ['Avgust', '0 ta', null, null, "hisoblangan dars yo'q"],
      ['Sentabr', '5 ta', null, '187\u00a0500', null],
    ]);
    expect(nb(v.months[2].details[0])).toBe(
      "oylik to'lov: 19-sentabrdan, 12 darsdan 5 tasi × 37 500",
    );
  });

  it('explains the sharp change in plain words', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(nb(v.sharpNote!.map((s) => s.text).join(''))).toBe(
      "Sentabr iyuldan 82 500 so'm kam. Sababi: darslar soni 5 ta (iyulda 9 ta); 1 dars narxi 30 000 → 37 500; 19-sentabrdan #036 guruhda o'qiydi (23-iyuldan beri darsda bo'lmagan); sentabrdan oylik to'lov.",
    );
    expect(v.months[2].highlight).toBe(true);
  });

  it('says where each payment went', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(
      v.allocations.map((a) => [
        a.date,
        a.what,
        nb(a.amount),
        nb(a.to),
        a.paymentId,
      ]),
    ).toEqual([
      ['21.07.2026', 'Naqd', '200 000', 'iyul darslari 200 000', 'p1'],
    ]);
  });

  it('tells a student with money ahead where it goes', () => {
    const input = debtor();
    input.student.balance = 12_500;
    input.rows.push(
      row({
        type: 'PAYMENT',
        day: '2026-09-20',
        amount: 270_000,
        enrollmentId: null,
        paymentId: 'p2',
        paymentMethod: 'PAYME',
      }),
    );
    const v = presentStatement(buildStatement(input), 'student');
    expect(nb(v.answer.title)).toBe(
      "Qarzingiz yo'q. Hisobingizda 12 500 so'm ortiqcha pul bor.",
    );
    expect(v.answer.subtitle).toBe("U oktabr to'loviga o'tadi.");
    expect(nb(v.allocations[1].to)).toBe(
      "iyul darslari 70 000, sentabr darslari 187 500 · ortig'i 12 500 hisobingizda (oktabr to'loviga)",
    );
  });

  it('says the pack era once, above the table', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(v.packHint).toBe(
      "Sentabrgacha pul 12 darslik paket uchun to'lanardi. Jadvalda esa har dars o'tilgan oyiga yozilgan, shuning uchun bir oyda 12 tadan ko'p yoki kam dars bo'lishi mumkin.",
    );
  });

  it('warns the admin, not the student, when the statement is off the balance', () => {
    const input = debtor();
    input.student.balance = -250_000;
    expect(
      presentStatement(buildStatement(input), 'student').warning,
    ).toBeNull();
    expect(presentStatement(buildStatement(input), 'admin').warning).toContain(
      '7\u00a0500',
    );
  });
});
