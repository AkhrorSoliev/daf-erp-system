import {
  PUNKTE_PRO_WORT,
  punkteFuer,
  serieAus,
  stufeFuer,
  wochenStartUtc,
} from './punkte';

describe('punkteFuer', () => {
  it("muddati kelgan so'zga to'g'ri javob 10 ball beradi", () => {
    expect(punkteFuer([{ faellig: true, richtig: true }])).toBe(10);
  });

  it("muddati KELMAGAN so'z nol beradi — darsni qayta o'tish yo'li shu", () => {
    expect(punkteFuer([{ faellig: false, richtig: true }])).toBe(0);
  });

  it('xato javob nol beradi', () => {
    expect(punkteFuer([{ faellig: true, richtig: false }])).toBe(0);
  });

  it("PAAR: to'rt so'zning har biri o'z ballini oladi", () => {
    expect(
      punkteFuer([
        { faellig: true, richtig: true },
        { faellig: true, richtig: true },
        { faellig: false, richtig: true },
        { faellig: true, richtig: false },
      ]),
    ).toBe(20);
  });

  it("so'z bo'lmagan savol (gap, ibora) nol beradi", () => {
    expect(punkteFuer([])).toBe(0);
  });

  it('PUNKTE_PRO_WORT 10 ga teng', () => {
    expect(PUNKTE_PRO_WORT).toBe(10);
  });
});

describe('stufeFuer', () => {
  it('nol ballda Anfanger', () => {
    expect(stufeFuer(0).jetzt.de).toBe('Anfänger');
    expect(stufeFuer(0).naechste?.ab).toBe(300);
  });

  it('chegaraning AYNAN ustidagi ball yangi darajani beradi', () => {
    expect(stufeFuer(299).jetzt.de).toBe('Anfänger');
    expect(stufeFuer(300).jetzt.de).toBe('Lerner');
  });

  it('eng yuqori darajadan keyin naechste null', () => {
    expect(stufeFuer(16_000).jetzt.de).toBe('Meister');
    expect(stufeFuer(16_000).naechste).toBeNull();
    expect(stufeFuer(999_999).jetzt.de).toBe('Meister');
  });

  it("har darajaning o'zbekchasi bor", () => {
    for (const g of [0, 300, 1500, 4000, 9000, 16000]) {
      expect(stufeFuer(g).jetzt.uz.length).toBeGreaterThan(0);
    }
  });
});

describe('wochenStartUtc', () => {
  it('dushanba Toshkent yarim tunini qaytaradi (UTC 19:00, yakshanba)', () => {
    // 2026-09-06 yakshanba, Toshkentda 12:00 (UTC 07:00).
    // O'sha haftaning dushanbasi — 2026-08-31.
    const start = wochenStartUtc(new Date('2026-09-06T07:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-08-30T19:00:00.000Z');
  });

  it("dushanba kuni ertalab O'SHA kunni qaytaradi, oldingi haftani emas", () => {
    // 2026-08-31 dushanba, Toshkentda 09:00 (UTC 04:00).
    const start = wochenStartUtc(new Date('2026-08-31T04:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-08-30T19:00:00.000Z');
  });

  it('yakshanba kechqurun Toshkentda hali eski hafta', () => {
    // Toshkentda 2026-09-06 (yakshanba) 23:00 = UTC 18:00.
    // UTC bo'yicha kun hali yakshanba, Toshkentda ham.
    const start = wochenStartUtc(new Date('2026-09-06T18:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-08-30T19:00:00.000Z');
  });
});

describe('serieAus', () => {
  it('bugun mashq qilingan bo`lsa seriya bugundan sanaladi', () => {
    expect(
      serieAus(['2026-09-06', '2026-09-05', '2026-09-04'], '2026-09-06'),
    ).toBe(3);
  });

  it('bugun hali mashq qilinmagan bo`lsa seriya SAQLANADI', () => {
    // Kun tugamagan — kecha bilan tugagan zanjir hali buzilmagan.
    expect(serieAus(['2026-09-05', '2026-09-04'], '2026-09-06')).toBe(2);
  });

  it('bir kun tashlansa nolga tushadi', () => {
    expect(serieAus(['2026-09-04', '2026-09-03'], '2026-09-06')).toBe(0);
  });

  it('hech qachon mashq qilmagan o`quvchida nol', () => {
    expect(serieAus([], '2026-09-06')).toBe(0);
  });

  it('takrorlangan sana zanjirni uzmaydi', () => {
    expect(
      serieAus(['2026-09-06', '2026-09-06', '2026-09-05'], '2026-09-06'),
    ).toBe(2);
  });
});
