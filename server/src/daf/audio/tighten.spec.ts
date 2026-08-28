import { parseSilences, speechSpans, tighten } from './tighten';

describe('parseSilences', () => {
  it('ffmpeg chiqishidan jimliklarni o`qiydi', () => {
    const out = [
      '[silencedetect @ 0x1] silence_start: 1.206875',
      '[silencedetect @ 0x1] silence_end: 3.638125 | silence_duration: 2.43',
    ].join('\n');

    expect(parseSilences(out)).toEqual([{ startMs: 1207, endMs: 3638 }]);
  });

  // Oxirgi jimlik fayl oxirigacha davom etishi mumkin — unda `silence_end`
  // umuman chiqmaydi.
  it('tugamagan jimlikni yutmaydi', () => {
    const out = 'silence_start: 47.500';
    expect(parseSilences(out)).toEqual([{ startMs: 47500, endMs: 47500 }]);
  });
});

describe('speechSpans', () => {
  // ffmpeg jimliklarni beradi, bizga esa ular ORASIDAGI nutq kerak.
  it('jimliklar orasidagi nutqni qaytaradi', () => {
    const spans = speechSpans(
      [
        { startMs: 1200, endMs: 3600 },
        { startMs: 4200, endMs: 6500 },
      ],
      8000,
    );

    expect(spans).toEqual([
      { startMs: 0, endMs: 1200 },
      { startMs: 3600, endMs: 4200 },
      { startMs: 6500, endMs: 8000 },
    ]);
  });

  it('jimliksiz faylda butun davomiylikni beradi', () => {
    expect(speechSpans([], 5000)).toEqual([{ startMs: 0, endMs: 5000 }]);
  });
});

describe('tighten', () => {
  // Whisper bo'lakni keyingisining boshigacha cho'zadi: «Hallo» 3.38–6.34
  // deb keladi, aslida 3.64–4.21 da aytiladi. Shu holicha o'ynatilsa so'z
  // tugagach ikki soniya jimlik davom etadi.
  it('bo`lakni ichidagi haqiqiy nutqqa qisqartiradi', () => {
    const out = tighten(
      { startMs: 3380, endMs: 6340, text: 'Hallo' },
      [{ startMs: 3640, endMs: 4210 }],
      60,
    );

    expect(out.startMs).toBe(3580);
    expect(out.endMs).toBe(4270);
  });

  // Jimlik aniqlash sozlamasi har faylga to'g'ri kelmasligi mumkin.
  // Kesishma topilmasa bo'lak o'zgarmaydi: kengroq oraliq noto'g'risidan
  // yaxshiroq.
  it('kesishma bo`lmasa bo`lakni o`zgartirmaydi', () => {
    const segment = { startMs: 3380, endMs: 6340, text: 'Hallo' };
    expect(tighten(segment, [{ startMs: 20000, endMs: 21000 }])).toEqual(
      segment,
    );
  });

  it('bo`lak chegarasidan tashqariga chiqmaydi', () => {
    const out = tighten(
      { startMs: 1000, endMs: 2000, text: 'x' },
      [{ startMs: 500, endMs: 3000 }],
      500,
    );

    expect(out.startMs).toBe(1000);
    expect(out.endMs).toBe(2000);
  });
});
