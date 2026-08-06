import { TransactionType } from '@prisma/client';
import {
  replayStudentLedger,
  splitLessonSlices,
  type LessonSlice,
  type ReplayRow,
} from './ledger-replay';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * Kichik quruvchi: har qator o'z `balanceBefore` ini oldingi qatordan meros
 * qilib oladi, shunda fixture yozganda zanjirni qo'lda hisoblash shart emas.
 */
function chain(
  entries: Array<{ id: string; type: TransactionType; amount: number }>,
  opening = 0,
): ReplayRow[] {
  let balance = opening;
  return entries.map((e) => {
    const balanceBefore = balance;
    balance += e.amount;
    return { ...e, balanceBefore, balanceAfter: balance };
  });
}

const ded = (id: string, amount: number) => ({
  id,
  type: TransactionType.LESSON_DEDUCTION,
  amount,
});
const pay = (id: string, amount: number) => ({
  id,
  type: TransactionType.PAYMENT,
  amount,
});

describe('splitLessonSlices', () => {
  it('splits a batch into per-lesson slices that sum back to the total', () => {
    const slices = splitLessonSlices(
      -400000,
      { lessonsCovered: 12, perLessonCost: 33333 },
      [d('2026-05-02'), d('2026-05-05')],
    );
    expect(slices).toHaveLength(12);
    expect(slices.reduce((s, x) => s + x.cost, 0)).toBe(400000);
    // Faqat ikki dars o'tilgan — qolgan bo'laklar sanasiz (oldindan).
    expect(slices[0].date).toEqual(d('2026-05-02'));
    expect(slices[1].date).toEqual(d('2026-05-05'));
    expect(slices[2].date).toBeNull();
  });

  it('recovers capacity from perLessonCost when metadata has no lessonsCovered', () => {
    const slices = splitLessonSlices(-99999, { perLessonCost: 33333 }, []);
    expect(slices).toHaveLength(3);
    expect(slices.every((s) => s.cost === 33333)).toBe(true);
  });

  it('falls back to a single slice when nothing is known', () => {
    expect(splitLessonSlices(-33333, null, [])).toEqual([
      { cost: 33333, date: null },
    ]);
  });
});

describe('replayStudentLedger — #10460 golden fixture', () => {
  // O'quvchi #10460 (Javohirbek Hamraliyev) ning PRODdagi haqiqiy ledgeri:
  // 3 ta to'lov + 19 ta dars yechimi. Bu aynan foydalanuvchi shikoyat qilgan
  // holat — 21.07 kartasi "233 339 balansda qoldi" deb ko'rsatgan, o'quvchi
  // esa o'sha payt 33 325 so'm qarzdor edi.
  const rows = chain([
    pay('P1', 400000), //            07.05
    ded('D-0516', -400000), //       16.05  12 dars (to'liq sikl)
    ded('D-0606', -33333), //        06.06  qarzga
    ded('D-0609', -33333),
    ded('D-0611', -33333),
    ded('D-0613', -33333),
    ded('D-0616', -33333),
    ded('D-0618', -33333),
    ded('D-0620', -33333),
    ded('D-0625a', -33333), //       25.06 03:54
    pay('P2', 400000), //            25.06 09:56
    ded('D-0625b', -133332), //      25.06 11:16  4 dars
    ded('D-0707', -33333), //        07.07  qarzga (balans 4 so'm)
    ded('D-0709', -33333),
    ded('D-0711', -33333),
    ded('D-0714', -33333),
    ded('D-0716a', -33333),
    ded('D-0716b', -33333),
    ded('D-0718', -33333),
    pay('P3', 400000), //            21.07
    ded('D-0721', -166665), //       21.07  5 dars: 21.07 — 30.07
    ded('D-0804', -33333), //        04.08  qarzga
  ]);

  const slices = new Map<string, LessonSlice[]>([
    [
      'D-0516',
      splitLessonSlices(-400000, { lessonsCovered: 12 }, [
        d('2026-05-16'),
        d('2026-05-19'),
      ]),
    ],
    [
      'D-0625b',
      splitLessonSlices(-133332, { lessonsCovered: 4 }, [
        d('2026-06-25'),
        d('2026-06-27'),
        d('2026-07-02'),
        d('2026-07-02'),
      ]),
    ],
    [
      'D-0721',
      splitLessonSlices(-166665, { lessonsCovered: 5 }, [
        d('2026-07-21'),
        d('2026-07-23'),
        d('2026-07-25'),
        d('2026-07-28'),
        d('2026-07-30'),
      ]),
    ],
    [
      'D-0707',
      splitLessonSlices(-33333, { lessonsCovered: 1 }, [d('2026-07-07')]),
    ],
    [
      'D-0709',
      splitLessonSlices(-33333, { lessonsCovered: 1 }, [d('2026-07-09')]),
    ],
    [
      'D-0711',
      splitLessonSlices(-33333, { lessonsCovered: 1 }, [d('2026-07-11')]),
    ],
    [
      'D-0714',
      splitLessonSlices(-33333, { lessonsCovered: 1 }, [d('2026-07-14')]),
    ],
    [
      'D-0716a',
      splitLessonSlices(-33333, { lessonsCovered: 1 }, [d('2026-07-16')]),
    ],
    [
      'D-0716b',
      splitLessonSlices(-33333, { lessonsCovered: 1 }, [d('2026-07-16')]),
    ],
    [
      'D-0718',
      splitLessonSlices(-33333, { lessonsCovered: 1 }, [d('2026-07-18')]),
    ],
    [
      'D-0804',
      splitLessonSlices(-33333, { lessonsCovered: 1 }, [d('2026-08-04')]),
    ],
  ]);

  const result = replayStudentLedger(rows, slices);

  it('reconciles against the stored balance chain', () => {
    expect(result.reconciled).toBe(true);
  });

  it('reports the 21.07 payment exactly as the ledger says', () => {
    const p3 = result.byCredit.get('P3')!;
    expect(p3.toPreviousDebt).toBe(233327);
    expect(p3.toLessons).toBe(166665);
    expect(p3.unspent).toBe(8);
    expect(p3.toOther).toBe(0);
    // Faqat shu to'lov to'lagan darslar — 04.08 ga cho'zilmaydi.
    expect(p3.lessonCount).toBe(5);
    expect(p3.firstLessonDate).toEqual(d('2026-07-21'));
    expect(p3.lastLessonDate).toEqual(d('2026-07-30'));
    // Yopilgan qarz: iyulning 7 ta to'lanmagan darsi.
    expect(p3.debtLessonCount).toBe(7);
    expect(p3.debtFirstLessonDate).toEqual(d('2026-07-07'));
    expect(p3.debtLastLessonDate).toEqual(d('2026-07-18'));
  });

  it('reports the 25.06 payment as mostly debt repayment', () => {
    const p2 = result.byCredit.get('P2')!;
    expect(p2.toPreviousDebt).toBe(266664);
    // 133 332 (25.06 paketi) + 4 (07.07 darsining changi)
    expect(p2.toLessons).toBe(133336);
    expect(p2.unspent).toBe(0);
  });

  it('reports the first payment as fully spent on lessons', () => {
    const p1 = result.byCredit.get('P1')!;
    expect(p1.toPreviousDebt).toBe(0);
    expect(p1.toLessons).toBe(400000);
    expect(p1.unspent).toBe(0);
  });

  it('satisfies I-3 for every credit (nothing is lost or invented)', () => {
    for (const alloc of result.byCredit.values()) {
      expect(
        alloc.toPreviousDebt + alloc.toLessons + alloc.toOther + alloc.unspent,
      ).toBe(alloc.amount);
    }
  });

  it('satisfies I-2 — unspent minus outstanding debt is the real balance', () => {
    expect(result.unspentTotal - result.outstandingDebt).toBe(-33325);
    expect(rows[rows.length - 1].balanceAfter).toBe(-33325);
  });
});

describe('replayStudentLedger — the defect classes this replaces', () => {
  it('lets a later payment cover a lesson taken on credit', () => {
    // Eski FIFO shu yerda yiqilardi: yechim navbat BO'SH paytda kelgan,
    // shuning uchun keyingi to'lov uni hech qachon qoplamas edi va butun
    // 50 000 "balansda qoldi" deb ko'rsatilardi.
    const rows = chain([ded('D1', -50000), pay('P1', 50000)]);
    const r = replayStudentLedger(
      rows,
      new Map([['D1', [{ cost: 50000, date: d('2026-03-01') }]]]),
    );
    const p1 = r.byCredit.get('P1')!;
    expect(p1.toPreviousDebt).toBe(50000);
    expect(p1.unspent).toBe(0);
    expect(p1.debtLessonCount).toBe(1);
    expect(r.reconciled).toBe(true);
  });

  it('does not charge a reversed deduction twice', () => {
    // Bekor qilish ASL QATOR BILAN BIR XIL turda, musbat summada yoziladi.
    // Eski kod aslini filtrlab, qarshi qatorni `Math.abs` bilan yangi dars
    // talabiga aylantirardi — pul ikki marta yechilardi.
    const rows = chain([
      pay('P1', 100000),
      ded('D1', -40000),
      { id: 'D1-rev', type: TransactionType.LESSON_DEDUCTION, amount: 40000 },
    ]);
    const r = replayStudentLedger(
      rows,
      new Map([['D1', [{ cost: 40000, date: d('2026-03-02') }]]]),
    );
    expect(r.byCredit.get('P1')!.toLessons).toBe(40000);
    expect(r.unspentTotal).toBe(100000);
    expect(r.outstandingDebt).toBe(0);
    expect(r.reconciled).toBe(true);
  });

  it('counts an ADJUSTMENT debit instead of attributing it to lessons', () => {
    // Eski kod ADJUSTMENT ni umuman ko'rmasdi (PRODda 316 qator, 254
    // o'quvchi) va uning pulini "darslarga ketdi" deb yozardi.
    const rows = chain([
      pay('P1', 100000),
      { id: 'A1', type: TransactionType.ADJUSTMENT, amount: -100000 },
      ded('D1', -20000),
    ]);
    const r = replayStudentLedger(
      rows,
      new Map([['D1', [{ cost: 20000, date: d('2026-03-03') }]]]),
    );
    const p1 = r.byCredit.get('P1')!;
    expect(p1.toOther).toBe(100000);
    expect(p1.toLessons).toBe(0);
    expect(p1.unspent).toBe(0);
    expect(r.outstandingDebt).toBe(20000);
  });

  it('routes a REFUND to toOther and funds it partially when the balance is short', () => {
    const rows = chain([
      pay('P1', 300000),
      { id: 'R1', type: TransactionType.REFUND, amount: -400000 },
    ]);
    const r = replayStudentLedger(rows, new Map());
    const p1 = r.byCredit.get('P1')!;
    expect(p1.toOther).toBe(300000);
    expect(p1.unspent).toBe(0);
    expect(r.outstandingDebt).toBe(100000);
    expect(r.reconciled).toBe(true);
  });

  it('gives each payment only the lessons it actually funded', () => {
    // Bitta paket ikki to'lov o'rtasida bo'linadi — sana oralig'i har
    // to'lov uchun alohida bo'lishi kerak, butun paketniki emas.
    const rows = chain([pay('A', 30000), pay('B', 70000), ded('D1', -100000)]);
    const r = replayStudentLedger(
      rows,
      new Map([
        [
          'D1',
          [
            { cost: 25000, date: d('2026-08-01') },
            { cost: 25000, date: d('2026-08-03') },
            { cost: 25000, date: d('2026-08-05') },
            { cost: 25000, date: d('2026-08-08') },
          ],
        ],
      ]),
    );
    const a = r.byCredit.get('A')!;
    const b = r.byCredit.get('B')!;
    expect(a.toLessons).toBe(30000);
    expect(a.firstLessonDate).toEqual(d('2026-08-01'));
    expect(a.lastLessonDate).toEqual(d('2026-08-03'));
    expect(b.toLessons).toBe(70000);
    expect(b.lastLessonDate).toEqual(d('2026-08-08'));
  });

  it('fails closed when the stored chain does not add up', () => {
    // Zanjirda teshik (qator tushib qolgan) — biz yamalgan son emas,
    // "ishonchsiz" belgisini qaytaramiz.
    const rows: ReplayRow[] = [
      {
        id: 'P1',
        type: TransactionType.PAYMENT,
        amount: 100000,
        balanceBefore: 0,
        balanceAfter: 100000,
      },
      {
        id: 'D1',
        type: TransactionType.LESSON_DEDUCTION,
        amount: -20000,
        balanceBefore: 55555, // teshik
        balanceAfter: 35555,
      },
    ];
    expect(replayStudentLedger(rows, new Map()).reconciled).toBe(false);
  });
});
