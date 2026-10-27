import {
  aralashtir,
  savollarniTanla,
  type SavolNomzodi,
} from './savol-tanlash';

const n = (
  id: number,
  kind: SavolNomzodi['kind'],
  kun: number | null = null,
): SavolNomzodi => ({
  id,
  kind,
  oxirgiKorilgan: kun === null ? null : new Date(Date.UTC(2026, 9, kun)),
});

describe('savollarniTanla', () => {
  it("turlar aralash: 3 tanlash, 2 yozish, 1 eshitish (yetarli bo'lsa)", () => {
    const xs = [
      ...[1, 2, 3, 4, 5].map((i) => n(i, 'CHOOSE')),
      ...[6, 7, 8].map((i) => n(i, 'TYPE')),
      ...[9, 10].map((i) => n(i, 'LISTEN')),
    ];
    const ids = savollarniTanla(xs, new Set());
    const tur = (k: string) =>
      ids.filter((id) => xs.find((x) => x.id === id)!.kind === k).length;
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect([tur('CHOOSE'), tur('TYPE'), tur('LISTEN')]).toEqual([3, 2, 1]);
  });

  it("eshitish yo'q — bo'sh joy boshqa tur bilan to'ldiriladi", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7].map((i) =>
      n(i, i < 5 ? 'CHOOSE' : 'TYPE'),
    );
    expect(savollarniTanla(xs, new Set())).toHaveLength(6);
  });

  it("yaqinda ko'rilgan chiqmaydi, yetmasa eng eskisi qaytadi", () => {
    const xs = [
      n(1, 'CHOOSE'),
      n(2, 'CHOOSE'),
      n(3, 'TYPE'),
      n(4, 'TYPE'),
      n(5, 'CHOOSE', 26),
      n(6, 'CHOOSE', 20),
      n(7, 'CHOOSE', 25),
    ];
    const ids = savollarniTanla(xs, new Set([5, 6, 7]));
    expect(ids).toHaveLength(6);
    expect(ids).toEqual(expect.arrayContaining([1, 2, 3, 4, 6, 7]));
    expect(ids).not.toContain(5);
  });

  it('6 tadan kam nomzod — borini qaytaradi', () => {
    expect(
      savollarniTanla([n(1, 'CHOOSE'), n(2, 'TYPE')], new Set()),
    ).toHaveLength(2);
  });
});

describe('aralashtir', () => {
  it("asl massivni o'zgartirmaydi, elementlarni yo'qotmaydi", () => {
    const xs = [1, 2, 3, 4];
    const ys = aralashtir(xs, () => 0);
    expect(xs).toEqual([1, 2, 3, 4]);
    expect([...ys].sort()).toEqual([1, 2, 3, 4]);
  });
});
