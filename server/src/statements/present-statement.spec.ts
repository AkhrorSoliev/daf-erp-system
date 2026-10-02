import { buildStatement } from './build-statement';
import { presentStatement } from './present-statement';
import { dayName, som, signed } from './statement-text';
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
    firstName: 'Test',
    lastName: 'Student',
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
      "To'lagan 200 000 − darslari narxi 457 500 = −257 500",
    );
  });

  it('writes the months table with quiet months, absences and the monthly line', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(
      v.dues.map((m) => [
        m.label,
        m.lessons,
        m.lessonsNote,
        m.cost,
        m.costNote,
      ]),
    ).toEqual([
      ['Iyul', '9 ta', '1 kelmagan', '270\u00a0000', null],
      ['Avgust', '0 ta', null, null, "hisoblangan dars yo'q"],
      ['Sentabr', '5 ta', null, '187\u00a0500', null],
    ]);
    expect(nb(v.dues[2].details[0])).toBe(
      "oylik to'lov: 19-sentabrdan, 12 darsdan 5 tasi × 37 500",
    );
  });

  describe('the table of what is paid and what is owed', () => {
    const rows = (v: ReturnType<typeof presentStatement>) =>
      v.dues.map((d) => [d.label, nb(d.paid), nb(d.left), d.leftTone]);
    const paidUp = () => {
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
      return input;
    };

    it('splits each month into paid and owed, adding up to the answer', () => {
      const v = presentStatement(buildStatement(debtor()), 'student');
      expect(rows(v)).toEqual([
        ['Iyul', '200 000', '70 000', 'red'],
        ['Avgust', '', '', 'muted'],
        ['Sentabr', '0', '187 500', 'red'],
      ]);
      expect(v.duesTotal && nb(v.duesTotal.left)).toBe('257 500');
      expect(v.surplus).toBeNull();
    });

    it('lists the payments alone, with their total and the month each went to', () => {
      const v = presentStatement(buildStatement(paidUp()), 'student');
      expect(v.payments.map((p) => [p.date, nb(p.amount), nb(p.to)])).toEqual([
        ['21.07.2026', '200 000', 'iyul'],
        [
          '20.09.2026',
          '270 000',
          "iyul 70 000, sentabr 187 500 · ortig'i 12 500 hisobingizda (oktabr to'loviga)",
        ],
      ]);
      expect(v.paidTotal && nb(v.paidTotal)).toBe('470 000');
    });

    it('shows a paid-up student no debt in any month and the money left over', () => {
      const v = presentStatement(buildStatement(paidUp()), 'student');
      expect(rows(v)).toEqual([
        ['Iyul', '270 000', "yo'q", 'green'],
        ['Avgust', '', '', 'muted'],
        ['Sentabr', '187 500', "yo'q", 'green'],
      ]);
      expect(v.duesTotal?.left).toBe("yo'q");
      expect(v.surplus && nb(v.surplus.amount)).toBe('+12 500');
    });

    it('keeps a written-off debt apart from what was paid', () => {
      const input = debtor();
      input.student.balance = -187_500;
      input.rows.push(
        row({
          type: 'DEBT_WRITE_OFF',
          day: '2026-08-14',
          amount: 70_000,
          enrollmentId: null,
        }),
      );
      const v = presentStatement(buildStatement(input), 'student');
      const july = v.dues[0];
      expect([nb(july.paid), july.left]).toEqual(['200 000', "yo'q"]);
      expect(july.details.map(nb)).toEqual([
        '70 000 — qarz kechirildi (14.08)',
      ]);
      expect(v.payments).toHaveLength(1);
      expect(v.duesTotal?.details.map(nb)).toEqual([
        '70 000 — qarz kechirildi',
      ]);
    });

    it('gives a refund paid out a row of its own', () => {
      const input = paidUp();
      input.student.balance = 2_500;
      input.rows.push(
        row({
          type: 'REFUND',
          day: '2026-09-25',
          amount: -10_000,
          enrollmentId: null,
        }),
      );
      const v = presentStatement(buildStatement(input), 'student');
      const refund = v.dues[v.dues.length - 1];
      expect([refund.label, refund.wide, nb(refund.cost ?? '')]).toEqual([
        'Sizga naqd qaytarib berildi (25.09)',
        true,
        '10 000',
      ]);
      expect(v.duesTotal && nb(v.duesTotal.cost)).toBe('467 500');
    });

    it('promises nothing for an excused lesson that has not reduced a charge', () => {
      const input = debtor();
      input.charges[0].excusedLessons = 1;
      const v = presentStatement(buildStatement(input), 'student');
      expect(v.dues.flatMap((d) => d.details).join('|')).not.toContain('uzrli');
    });

    it('says a full month is charged at its start while lessons are ahead', () => {
      const input = debtor();
      input.asOf = '2026-09-20';
      const v = presentStatement(buildStatement(input), 'student');
      expect(nb(v.dues[2].details.join('|'))).toBe(
        "oylik to'lov: 19-sentabrdan, 12 darsdan 5 tasi × 37 500|" +
          "4 dars hali o'tilmagan — oylik to'lov oy boshida yoziladi",
      );
    });
  });

  it('explains the sharp change in plain words', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(nb(v.sharpNote!.map((s) => s.text).join(''))).toBe(
      "Sentabr iyuldan 82 500 so'm kam. Sababi: darslar soni 5 ta (iyulda 9 ta); 1 dars narxi 30 000 → 37 500; 19-sentabrdan #036 guruhda o'qiydi (23-iyuldan beri darsda bo'lmagan); sentabrdan oylik to'lov.",
    );
    expect(v.dues[2].highlight).toBe(true);
  });

  it('says where each payment went', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(
      v.payments.map((a) => [
        a.date,
        a.what,
        nb(a.amount),
        nb(a.to),
        a.paymentId,
      ]),
    ).toEqual([['21.07.2026', 'Naqd', '200 000', 'iyul', 'p1']]);
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
    expect(nb(v.payments[1].to)).toBe(
      "iyul 70 000, sentabr 187 500 · ortig'i 12 500 hisobingizda (oktabr to'loviga)",
    );
  });

  it('says the pack era once, in the notes', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(v.notes[0]).toBe(
      "Sentabrgacha pul 12 darslik paket uchun to'lanardi. Jadvalda esa har dars o'tilgan oyiga yozilgan, shuning uchun bir oyda 12 tadan ko'p yoki kam dars bo'lishi mumkin.",
    );
  });

  it('shows April lessons paid before the system with nothing to add up', () => {
    const input = debtor();
    input.rows.unshift(
      row({
        type: 'LESSON_DEDUCTION',
        day: '2026-04-25',
        amount: -120_000,
        enrollmentId: 'e0',
        metadata: { lessonsCovered: 4 },
        consumedDays: ['2026-04-23', '2026-04-25', '2026-04-28', '2026-04-30'],
      }),
      row({
        type: 'ADJUSTMENT',
        day: '2026-06-06',
        amount: 120_000,
        enrollmentId: null,
        metadata: { marker: 'april-cutover-refund' },
      }),
    );
    const april = presentStatement(buildStatement(input), 'student').dues[0];
    expect([
      april.label,
      april.lessons,
      april.cost,
      april.costNote,
      april.paid,
      april.left,
    ]).toEqual(['Aprel', '4 ta', null, "tizimga qadar to'langan", '', '']);
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
