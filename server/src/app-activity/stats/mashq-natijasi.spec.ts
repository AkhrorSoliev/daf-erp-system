import { foizi, mashqNatijasi, MashqUrinishi } from './mashq-natijasi';

const u = (o: Partial<MashqUrinishi>): MashqUrinishi => ({
  sessionId: 's1',
  questionIndex: 0,
  attemptNo: 1,
  format: 'WORT_UZ',
  score: 1,
  gradingStatus: 'GRADED',
  createdAt: new Date('2026-09-13T05:00:00Z'),
  ...o,
});

describe('mashqNatijasi', () => {
  it('seanslar alohida: bir xil questionIndex ikki seansda — ikki savol', () => {
    const n = mashqNatijasi([
      u({ sessionId: 's1' }),
      u({ sessionId: 's2', score: 0 }),
    ]);
    expect(n).toMatchObject({ savollar: 2, togri: 1, xatolar: 1, foiz: 50 });
  });

  it('sessionId bo`sh (eski yo`l) savol hisobiga kirmaydi', () => {
    expect(mashqNatijasi([u({ sessionId: null })]).savollar).toBe(0);
  });

  it('ko`nikmalar reyestr bo`yicha; SPRECHEN har doim bor, savolsiz', () => {
    const n = mashqNatijasi([
      u({ questionIndex: 0, format: 'WORT_UZ', score: 1 }),
      u({ questionIndex: 1, format: 'LUECKE', score: 0 }),
      u({ questionIndex: 2, format: 'LUECKE', score: 1 }),
    ]);
    const k = Object.fromEntries(n.konikmalar.map((x) => [x.konikma, x]));
    expect(k.WORTSCHATZ).toEqual({
      konikma: 'WORTSCHATZ',
      savollar: 1,
      togri: 1,
      foiz: 100,
    });
    expect(k.GRAMMATIK).toEqual({
      konikma: 'GRAMMATIK',
      savollar: 2,
      togri: 1,
      foiz: 50,
    });
    expect(k.SPRECHEN).toEqual({
      konikma: 'SPRECHEN',
      savollar: 0,
      togri: 0,
      foiz: null,
    });
    expect(n.konikmalar).toHaveLength(6);
  });

  it('savolKunlari Toshkent kuni bo`yicha', () => {
    const n = mashqNatijasi([
      u({ questionIndex: 0, createdAt: new Date('2026-09-12T19:30:00Z') }), // 13.09 00:30
      u({ questionIndex: 1, createdAt: new Date('2026-09-12T18:30:00Z') }), // 12.09 23:30
    ]);
    expect(n.savolKunlari).toEqual({ '2026-09-13': 1, '2026-09-12': 1 });
  });

  it('foizi: 0 savol — null, yumaloqlanadi', () => {
    expect(foizi(0, 0)).toBeNull();
    expect(foizi(2, 3)).toBe(67);
  });
});
