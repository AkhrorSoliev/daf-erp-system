import { berishRejasi, seriyaTarixi } from './daf-badges-backfill-plan';

const HOZIR = new Date('2026-10-19T10:00:00.000Z');
const holat = (o: {
  tage?: string[];
  woerter?: number;
  olingan?: string[];
}) => ({
  studentId: 55,
  companyId: 1,
  tage: o.tage ?? [],
  woerter: o.woerter ?? 0,
  olingan: new Set(o.olingan ?? []),
});

describe('seriyaTarixi', () => {
  it('eng uzun qator va har uzunlikka birinchi yetilgan kun', () => {
    const t = seriyaTarixi([
      '2026-10-11',
      '2026-10-01',
      '2026-10-02',
      '2026-10-02', // takror
      '2026-10-03',
      '2026-10-10',
    ]);
    expect(t.engUzun).toBe(3);
    expect(t.yetganKun.get(1)).toBe('2026-10-01');
    expect(t.yetganKun.get(2)).toBe('2026-10-02');
    expect(t.yetganKun.get(3)).toBe('2026-10-03');
  });

  it("oy chegarasidan o'tadi", () => {
    expect(seriyaTarixi(['2026-09-30', '2026-10-01']).engUzun).toBe(2);
  });

  it("bo'sh tarix", () => {
    expect(seriyaTarixi([]).engUzun).toBe(0);
  });
});

describe('berishRejasi', () => {
  it('uzilgan 7 kunlik seriya ham SERIE_3 va SERIE_7 beradi, o`sha kunlar bilan', () => {
    const tage = [
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-10-19', // hozirgi seriya 1
    ];
    const r = berishRejasi(holat({ tage }), HOZIR)!;
    expect(r.yangi).toEqual(['SERIE_3', 'SERIE_7']);
    expect(r.sharoit).toEqual({ serie: 7, woerter: 0 });
    expect(r.earnedAt).toEqual({
      SERIE_3: new Date('2026-09-03T07:00:00.000Z'),
      SERIE_7: new Date('2026-09-07T07:00:00.000Z'),
    });
  });

  it("so'z nishonlari skript vaqti bilan", () => {
    const r = berishRejasi(holat({ woerter: 150 }), HOZIR)!;
    expect(r.yangi).toEqual(['WOERTER_50', 'WOERTER_150']);
    expect(r.earnedAt).toEqual({ WOERTER_50: HOZIR, WOERTER_150: HOZIR });
  });

  it('allaqachon olingani rejaga kirmaydi; yangi yo`q — null', () => {
    expect(
      berishRejasi(holat({ woerter: 60, olingan: ['WOERTER_50'] }), HOZIR),
    ).toBeNull();
    const r = berishRejasi(
      holat({ woerter: 160, olingan: ['WOERTER_50'] }),
      HOZIR,
    )!;
    expect(r.yangi).toEqual(['WOERTER_150']);
    expect(Object.keys(r.earnedAt)).toEqual(['WOERTER_150']);
  });

  it('2 kunlik tarix va 49 so`z — hech narsa', () => {
    expect(
      berishRejasi(
        holat({ tage: ['2026-10-18', '2026-10-19'], woerter: 49 }),
        HOZIR,
      ),
    ).toBeNull();
  });
});
