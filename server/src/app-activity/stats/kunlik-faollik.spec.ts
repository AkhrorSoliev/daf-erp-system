import { birlashmaSoniyasi, kunlikYigindi, SeansSatri } from './kunlik-faollik';

const t = (hhmmss: string) => new Date(`2026-09-13T${hhmmss}Z`);
const seans = (o: Partial<SeansSatri>): SeansSatri => ({
  day: '2026-09-13',
  firstSeenAt: t('05:00:00'),
  lastSeenAt: t('05:10:00'),
  activeSeconds: 300,
  radioSeconds: 0,
  platform: 'WEB',
  sections: { LERNEN: 200, OTHER: 100 },
  ...o,
});

describe('birlashmaSoniyasi', () => {
  it('ustma-ust oraliqlarni bir marta sanaydi', () => {
    expect(
      birlashmaSoniyasi([
        [0, 100_000],
        [50_000, 150_000],
        [200_000, 210_000],
      ]),
    ).toBe(160);
  });
  it('bo`sh ro`yxat — 0', () => {
    expect(birlashmaSoniyasi([])).toBe(0);
  });
});

describe('kunlikYigindi', () => {
  it('bir kunning seanslari qo`shiladi, platforma va bo`lim bo`yicha', () => {
    const k = kunlikYigindi([
      seans({}),
      seans({
        firstSeenAt: t('07:00:00'),
        lastSeenAt: t('07:05:00'),
        activeSeconds: 120,
        platform: 'ANDROID',
        sections: { OTHER: 120 },
      }),
    ]).get('2026-09-13')!;
    expect(k.faolSoniya).toBe(420);
    expect(k.platforma).toEqual({ WEB: 300, ANDROID: 120, IOS: 0 });
    expect(k.bolim).toEqual({ LERNEN: 200, OTHER: 220 });
    expect(k.kirdi).toBe(true);
  });

  it('parallel seanslar kunlik birlashmadan oshmaydi (ADR-0020)', () => {
    // ikkala seans 05:00–05:10 (+120 s zaxira) = 720 s birlashma, lekin 600+600 da'vo
    const k = kunlikYigindi([
      seans({ activeSeconds: 600, sections: { LERNEN: 600 } }),
      seans({ activeSeconds: 600, sections: { LERNEN: 600 } }),
    ]).get('2026-09-13')!;
    expect(k.faolSoniya).toBe(720);
    expect(k.bolim.LERNEN).toBe(720);
    expect(k.platforma.WEB).toBe(720);
  });

  it('radio ham birlashma bilan cheklanadi, faolga qo`shilmaydi', () => {
    const k = kunlikYigindi([
      seans({ activeSeconds: 0, radioSeconds: 700, sections: {} }),
      seans({ activeSeconds: 0, radioSeconds: 700, sections: {} }),
    ]).get('2026-09-13')!;
    expect(k.radioSoniya).toBe(720);
    expect(k.faolSoniya).toBe(0);
  });

  it('kirdi: 9 s — yo`q, 10 s — ha', () => {
    expect(
      kunlikYigindi([seans({ activeSeconds: 9, sections: {} })]).get(
        '2026-09-13',
      )!.kirdi,
    ).toBe(false);
    expect(
      kunlikYigindi([seans({ activeSeconds: 10, sections: {} })]).get(
        '2026-09-13',
      )!.kirdi,
    ).toBe(true);
  });

  it('turli kunlar alohida', () => {
    const m = kunlikYigindi([seans({}), seans({ day: '2026-09-12' })]);
    expect([...m.keys()].sort()).toEqual(['2026-09-12', '2026-09-13']);
  });
});
