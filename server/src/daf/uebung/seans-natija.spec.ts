import {
  savolNatijalari,
  seansYigindisi,
  type UrinishSatri,
} from './seans-natija';

function s(
  questionIndex: number,
  attemptNo: number,
  score: number,
  format = 'WORT_UZ',
): UrinishSatri {
  return { questionIndex, attemptNo, format, score, gradingStatus: 'GRADED' };
}

const satr = (o: Partial<UrinishSatri>): UrinishSatri => ({
  questionIndex: 0,
  attemptNo: 1,
  format: 'WORT_UZ',
  score: 1,
  gradingStatus: 'GRADED',
  ...o,
});

describe('seansYigindisi', () => {
  it("oddiy savol: birinchi urinish sanaladi, o'rinbosar (attemptNo 2) foizni o'zgartirmaydi", () => {
    const r = seansYigindisi([
      s(0, 1, 1),
      s(1, 1, 0),
      s(1, 2, 1), // xatodan keyin boshqa formatda to'g'ri — baribir 0
      s(2, 1, 1),
    ]);
    expect(r).toEqual({ questionCount: 3, firstTryCorrect: 2 });
  });

  it('juftlash: hamma juft birinchi bosishda to`g`ri — 1', () => {
    const r = seansYigindisi([
      s(0, 1, 1, 'PAAR'),
      s(0, 1, 1, 'PAAR'),
      s(0, 1, 1, 'PAAR'),
      s(0, 1, 1, 'PAAR'),
    ]);
    expect(r).toEqual({ questionCount: 1, firstTryCorrect: 1 });
  });

  it('juftlash: bitta xato bosish — 0, savol baribir sanaladi', () => {
    const r = seansYigindisi([
      s(0, 1, 1, 'PAAR'),
      s(0, 1, 0, 'PAAR'),
      s(0, 1, 1, 'PAAR'),
      s(0, 1, 1, 'PAAR'),
      s(0, 1, 1, 'PAAR'),
    ]);
    expect(r).toEqual({ questionCount: 1, firstTryCorrect: 0 });
  });

  it('juftlash: hal bo`lmagan savol (juftlar yetmagan, xato yo`q) hisobga kirmaydi', () => {
    const r = seansYigindisi([s(0, 1, 1, 'ZUORDNEN'), s(0, 1, 1, 'ZUORDNEN')]);
    expect(r).toEqual({ questionCount: 0, firstTryCorrect: 0 });
  });

  it('PENDING va UNGRADED savollar foizga kirmaydi', () => {
    const r = seansYigindisi([
      s(0, 1, 1),
      { ...s(1, 1, 0), gradingStatus: 'PENDING' },
      { ...s(2, 1, 1), gradingStatus: 'UNGRADED' },
    ]);
    expect(r).toEqual({ questionCount: 1, firstTryCorrect: 1 });
  });

  it('sessionId`siz (eski) satrlar — questionIndex null — chetda qoladi', () => {
    const r = seansYigindisi([
      {
        questionIndex: null,
        attemptNo: null,
        format: null,
        score: null,
        gradingStatus: 'GRADED',
      },
      s(0, 1, 1),
    ]);
    expect(r).toEqual({ questionCount: 1, firstTryCorrect: 1 });
  });

  it('qisman ball (kelajakdagi format) 0.5 — savol to`g`ri emas, lekin sanaladi', () => {
    const r = seansYigindisi([s(0, 1, 0.5, 'KELAJAK')]);
    expect(r).toEqual({ questionCount: 1, firstTryCorrect: 0 });
  });
});

describe('savolNatijalari', () => {
  it('oddiy savol: birinchi urinish bali, o`rinbosar hisobga kirmaydi', () => {
    const t1 = new Date('2026-09-10T05:00:00Z');
    const natija = savolNatijalari([
      satr({ questionIndex: 0, score: 0, createdAt: t1 }),
      satr({ questionIndex: 0, attemptNo: 2, score: 1 }),
      satr({ questionIndex: 1, score: 1, format: 'LUECKE' }),
    ]);
    expect(natija).toEqual([
      { questionIndex: 0, format: 'WORT_UZ', togri: false, vaqt: t1 },
      { questionIndex: 1, format: 'LUECKE', togri: true, vaqt: null },
    ]);
  });

  it('juftlash: xato bor — noto`g`ri; hammasi to`g`ri — to`g`ri; yetmagan — yo`q', () => {
    const paar = (qi: number, score: number) =>
      satr({ questionIndex: qi, format: 'PAAR', score });
    const natija = savolNatijalari([
      paar(0, 1),
      paar(0, 0),
      paar(0, 1),
      paar(1, 1),
      paar(1, 1),
      paar(1, 1),
      paar(1, 1),
      paar(2, 1),
      paar(2, 1),
    ]);
    expect(natija.map((n) => [n.questionIndex, n.togri])).toEqual([
      [0, false],
      [1, true],
    ]);
  });

  it('PENDING va questionIndex bo`sh satrlar chetda', () => {
    expect(
      savolNatijalari([
        satr({ gradingStatus: 'PENDING' }),
        satr({ questionIndex: null }),
      ]),
    ).toEqual([]);
  });

  it('vaqt — savolning eng erta birinchi urinishi', () => {
    const erta = new Date('2026-09-10T05:00:00Z');
    const kech = new Date('2026-09-10T05:00:09Z');
    const [n] = savolNatijalari([
      satr({ format: 'ZUORDNEN', score: 1, createdAt: kech }),
      satr({ format: 'ZUORDNEN', score: 0, createdAt: erta }),
    ]);
    expect(n.vaqt).toEqual(erta);
  });

  it('seansYigindisi savolNatijalari bilan mos', () => {
    const satrlar = [
      satr({ questionIndex: 0, score: 1 }),
      satr({ questionIndex: 1, score: 0 }),
    ];
    expect(seansYigindisi(satrlar)).toEqual({
      questionCount: 2,
      firstTryCorrect: 1,
    });
  });
});
