import { davrniOqi, davrOynasi, kunlarOrasi } from './davr';

// 13.09.2026 10:00 Toshkent = 05:00 UTC
const NOW = new Date('2026-09-13T05:00:00Z');

describe('davr', () => {
  it('davrniOqi: faqat "30" — 30, qolgani 7', () => {
    expect(davrniOqi('30')).toBe(30);
    expect(davrniOqi('7')).toBe(7);
    expect(davrniOqi(undefined)).toBe(7);
    expect(davrniOqi('abc')).toBe(7);
  });

  it('7 kunlik oyna: bugun va oldingi 6 kun', () => {
    const o = davrOynasi(
      7,
      NOW,
      new Date('2026-01-01T00:00:00Z'),
      '2026-01-01',
    );
    expect(o.bugun).toBe('2026-09-13');
    expect(o.davrBoshi).toBe('2026-09-07');
    expect(o.kunlar).toHaveLength(7);
    expect(o.kunlar[0]).toBe('2026-09-07');
    expect(o.kunlar[6]).toBe('2026-09-13');
    expect(o.hisobBoshi).toBe('2026-09-07');
    expect(o.maxraj).toBe(7);
  });

  it('yangi akkaunt maxrajni qisqartiradi (Toshkent kuni bo`yicha)', () => {
    // 09.09 21:00 UTC = 10.09 02:00 Toshkent
    const o = davrOynasi(
      30,
      NOW,
      new Date('2026-09-09T21:00:00Z'),
      '2026-08-01',
    );
    expect(o.hisobBoshi).toBe('2026-09-10');
    expect(o.maxraj).toBe(4);
    expect(o.kunlar).toHaveLength(30);
  });

  it('kuzatuv boshlanishi maxrajni qisqartiradi; kuzatuv yo`q — bugun', () => {
    expect(
      davrOynasi(30, NOW, new Date('2026-01-01'), '2026-09-12').maxraj,
    ).toBe(2);
    expect(davrOynasi(30, NOW, new Date('2026-01-01'), null).maxraj).toBe(1);
  });

  it('kunlarOrasi', () => {
    expect(kunlarOrasi('2026-09-01', '2026-09-13')).toBe(12);
    expect(kunlarOrasi('2026-02-27', '2026-03-01')).toBe(2);
  });
});
