import { darajaNomi } from '../liga/liga-qoidalari';
import { NISHON_KATALOGI, qoldi, shartBajarilganlar } from './nishon-katalogi';

const bosh = { serie: 0, woerter: 0 };

describe('nishon katalogi', () => {
  it('S2 ning o`n kaliti va S3 ning olti kaliti, shu tartibda', () => {
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
      'LIGA_KUMUSH',
      'LIGA_OLTIN',
      'LIGA_YOQUT',
      'LIGA_OLMOS',
      'XONA_GOLIB',
      'GURUH_BIRINCHI',
    ]);
  });

  // Mijoz nomni kalitdan quradi («14 kun ketma-ket», «Kumush ligasi»).
  it('kalit nomni aytadi va takrorlanmaydi', () => {
    for (const n of NISHON_KATALOGI.filter(
      (x) => x.tur === 'SERIE' || x.tur === 'WOERTER',
    ))
      expect(n.key).toBe(`${n.tur}_${n.chegara}`);
    for (const n of NISHON_KATALOGI.filter((x) => x.tur === 'LIGA'))
      expect(n.key).toBe(`LIGA_${darajaNomi(n.chegara).toUpperCase()}`);
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

  it('liga: daraja ≥ 1 / 2 / 3 / 4; maydon yo`q bo`lsa — hech biri', () => {
    expect(shartBajarilganlar({ ...bosh, liga: 1 })).toEqual(['LIGA_KUMUSH']);
    expect(shartBajarilganlar({ ...bosh, liga: 4 })).toEqual([
      'LIGA_KUMUSH',
      'LIGA_OLTIN',
      'LIGA_YOQUT',
      'LIGA_OLMOS',
    ]);
    expect(shartBajarilganlar({ ...bosh, liga: 0 })).toEqual([]);
    expect(shartBajarilganlar(bosh)).toEqual([]);
  });

  it('xona g`olibi va guruh birinchi — holatdan', () => {
    expect(
      shartBajarilganlar({ ...bosh, xonaGolib: true, guruhBirinchi: true }),
    ).toEqual(['XONA_GOLIB', 'GURUH_BIRINCHI']);
    expect(
      shartBajarilganlar({ ...bosh, xonaGolib: false, guruhBirinchi: false }),
    ).toEqual([]);
  });

  it('qoldi — chegaragacha, hech qachon manfiy emas', () => {
    const serie14 = NISHON_KATALOGI.find((n) => n.key === 'SERIE_14')!;
    const soz150 = NISHON_KATALOGI.find((n) => n.key === 'WOERTER_150')!;
    const oltin = NISHON_KATALOGI.find((n) => n.key === 'LIGA_OLTIN')!;
    const golib = NISHON_KATALOGI.find((n) => n.key === 'XONA_GOLIB')!;
    expect(qoldi(serie14, { serie: 10, woerter: 0 })).toBe(4);
    expect(qoldi(soz150, { serie: 0, woerter: 120 })).toBe(30);
    expect(qoldi(serie14, { serie: 20, woerter: 0 })).toBe(0);
    expect(qoldi(oltin, { ...bosh, liga: 1 })).toBe(1);
    expect(qoldi(oltin, { ...bosh, liga: 4 })).toBe(0);
    expect(qoldi(golib, bosh)).toBe(1);
  });
});
