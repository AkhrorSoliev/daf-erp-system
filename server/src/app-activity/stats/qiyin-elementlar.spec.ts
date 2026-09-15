import { qiyinElementlar } from './qiyin-elementlar';

const r = (
  itemId: number,
  oquvchilar: number,
  ortachaBall: number,
  format = 'WORT_UZ',
) => ({
  itemType: 'WORT',
  itemId,
  oquvchilar,
  ortachaBall,
  format,
});

describe('qiyinElementlar', () => {
  it('3 dan kam o`quvchi va xatosizlar tushadi; xato bo`yicha kamayish', () => {
    const n = qiyinElementlar([
      r(1, 2, 0),
      r(2, 3, 0.5),
      r(3, 4, 0.25, 'LUECKE'),
      r(4, 5, 1),
    ]);
    expect(n).toEqual([
      {
        itemType: 'WORT',
        itemId: 3,
        format: 'LUECKE',
        konikma: 'GRAMMATIK',
        xatoFoizi: 75,
        oquvchilar: 4,
      },
      {
        itemType: 'WORT',
        itemId: 2,
        format: 'WORT_UZ',
        konikma: 'WORTSCHATZ',
        xatoFoizi: 50,
        oquvchilar: 3,
      },
    ]);
  });

  it('teng xatoda ko`p o`quvchi oldin; eng ko`pi 6 ta', () => {
    const rows = Array.from({ length: 8 }, (_, i) => r(i + 1, 3 + i, 0.5));
    const n = qiyinElementlar(rows);
    expect(n).toHaveLength(6);
    expect(n[0].itemId).toBe(8);
  });
});
