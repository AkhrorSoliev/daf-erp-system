import { birlashtir, bolimlarniOqi } from './heartbeat-merge';

const T0 = new Date('2026-09-13T10:00:00.000Z');
const soniyadan = (s: number) => new Date(T0.getTime() + s * 1000);
const q = (activeSeconds: number, radioSeconds = 0, sections = {}) => ({
  activeSeconds,
  radioSeconds,
  sections,
});

describe('birlashtir', () => {
  it('birinchi yozuv: kelgan qiymat soat zaxirasi (120 s) ichida saqlanadi', () => {
    expect(birlashtir(null, q(60, 30), T0, T0)).toEqual(q(60, 30));
  });

  it('soxta katta raqam soat bilan qirqiladi: firstSeenAt dan 60 s o`tgan — ko`pi bilan 180', () => {
    const r = birlashtir(q(60), q(5000, 5000), T0, soniyadan(60));
    expect(r.activeSeconds).toBe(180);
    expect(r.radioSeconds).toBe(180);
  });

  it('takroriy yoki eskirgan so`rov vaqtni kamaytirmaydi — max olinadi', () => {
    const r = birlashtir(q(300, 200), q(200, 100), T0, soniyadan(3600));
    expect(r).toEqual(q(300, 200));
  });

  it('manfiy va o`nlik qiymatlar: 0 dan kichik emas, butunga tushiriladi', () => {
    const r = birlashtir(null, q(-5, 12.7), T0, soniyadan(600));
    expect(r.activeSeconds).toBe(0);
    expect(r.radioSeconds).toBe(12);
  });

  it('bo`limlar kalit bo`yicha max; yig`indi faol vaqtdan oshsa mutanosib kamayadi', () => {
    const r = birlashtir(
      q(60, 0, { LERNEN: 50 }),
      q(60, 0, { LERNEN: 40, OTHER: 30 }),
      T0,
      soniyadan(3600),
    );
    // LERNEN max(50,40)=50, OTHER 30 → 80 > 60 → koeffitsient 0.75
    expect(r.sections).toEqual({ LERNEN: 37, OTHER: 22 });
  });

  it('bo`limlar yig`indisi faol vaqtdan oshmasa o`zgarmaydi', () => {
    const r = birlashtir(
      null,
      q(100, 0, { LERNEN: 70, OTHER: 30 }),
      T0,
      soniyadan(3600),
    );
    expect(r.sections).toEqual({ LERNEN: 70, OTHER: 30 });
  });
});

describe('bolimlarniOqi', () => {
  it('faqat LERNEN va OTHER, musbat sonlar; boshqa kalit va noto`g`ri qiymat tashlanadi', () => {
    expect(
      bolimlarniOqi({ LERNEN: 12.9, OTHER: 'x', RADIO: 5, foo: 1 }),
    ).toEqual({ LERNEN: 12 });
    expect(bolimlarniOqi(null)).toEqual({});
    expect(bolimlarniOqi([1, 2])).toEqual({});
    expect(bolimlarniOqi({ LERNEN: -3, OTHER: 0 })).toEqual({});
  });
});
