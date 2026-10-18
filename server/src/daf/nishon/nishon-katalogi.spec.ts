import { NISHON_KATALOGI, qoldi, shartBajarilganlar } from './nishon-katalogi';

describe('nishon katalogi', () => {
  it('spec 2.1 dagi o`n kalit, shu tartibda', () => {
    expect(NISHON_KATALOGI.map((n) => n.key)).toEqual([
      'SERIE_3',
      'SERIE_7',
      'SERIE_14',
      'SERIE_30',
      'SERIE_60',
      'SERIE_100',
      'WOERTER_50',
      'WOERTER_150',
      'WOERTER_300',
      'WOERTER_592',
    ]);
  });

  // Mijoz nomni kalitdan quradi («14 kun ketma-ket»), shuning uchun kalit
  // tur va chegarani aynan aytishi shart.
  it('kalit = TUR_CHEGARA va takrorlanmaydi', () => {
    for (const n of NISHON_KATALOGI)
      expect(n.key).toBe(`${n.tur}_${n.chegara}`);
    expect(new Set(NISHON_KATALOGI.map((n) => n.key)).size).toBe(
      NISHON_KATALOGI.length,
    );
  });

  it('aynan N — shart bajarilgan; N−1 — yo`q', () => {
    expect(shartBajarilganlar({ serie: 7, woerter: 0 })).toEqual([
      'SERIE_3',
      'SERIE_7',
    ]);
    expect(shartBajarilganlar({ serie: 6, woerter: 49 })).toEqual(['SERIE_3']);
    expect(shartBajarilganlar({ serie: 0, woerter: 592 })).toEqual([
      'WOERTER_50',
      'WOERTER_150',
      'WOERTER_300',
      'WOERTER_592',
    ]);
    expect(shartBajarilganlar({ serie: 2, woerter: 49 })).toEqual([]);
  });

  it('qoldi — chegaragacha, hech qachon manfiy emas', () => {
    const serie14 = NISHON_KATALOGI.find((n) => n.key === 'SERIE_14')!;
    const soz150 = NISHON_KATALOGI.find((n) => n.key === 'WOERTER_150')!;
    expect(qoldi(serie14, { serie: 10, woerter: 0 })).toBe(4);
    expect(qoldi(soz150, { serie: 0, woerter: 120 })).toBe(30);
    expect(qoldi(serie14, { serie: 20, woerter: 0 })).toBe(0);
  });
});
