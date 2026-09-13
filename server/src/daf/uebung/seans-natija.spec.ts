import { seansYigindisi, type UrinishSatri } from './seans-natija';

function s(
  questionIndex: number,
  attemptNo: number,
  score: number,
  format = 'WORT_UZ',
): UrinishSatri {
  return { questionIndex, attemptNo, format, score, gradingStatus: 'GRADED' };
}

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
