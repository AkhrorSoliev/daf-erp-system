import {
  buildPicturablePrompt,
  parsePicturable,
  isCountry,
  isContinent,
  isGeographicProperNoun,
  isNumberWord,
  isNumeric,
  isPhrase,
  isNeverPicturable,
  applyNeverPicturableRule,
  COUNTRIES,
  CONTINENTS,
} from './picturable';

describe('isCountry', () => {
  // Flux bayroqlarni xato chizadi. Mamlakatlar uchun tayyor bayroq
  // aktivlari ishlatiladi, generatsiya emas.
  it('mamlakat nomini taniydi', () => {
    expect(isCountry('Deutschland')).toBe(true);
    expect(isCountry('die Schweiz')).toBe(true);
    expect(isCountry('gehen')).toBe(false);
  });

  it('A1 dagi 12 mamlakatni qamraydi', () => {
    for (const c of [
      'Belgien',
      'Italien',
      'Deutschland',
      'Kanada',
      'Luxemburg',
      'Polen',
      'Österreich',
      'Mexiko',
      'Frankreich',
      'Spanien',
    ])
      expect(COUNTRIES.has(c)).toBe(true);
  });

  // Haqiqiy bazada "die Niederlande" so'zi yolg'iz emas — qavs ichida
  // izoh bilan keladi: "die Niederlande (Holland)". Bu tekshiruv
  // haqiqiy chaqiruv yo'lidan o'tadi: `mark-picturable` skripti buni
  // to'g'ridan-to'g'ri bazadan olib shu funksiyaga beradi. Qavsni
  // tashlamasdan solishtirsa, bu so'z modelga tushib qolardi — mamlakat
  // ekanini bilmagan holda.
  it('qavs ichidagi izohni tashlab mamlakatni taniydi', () => {
    expect(isCountry('die Niederlande (Holland)')).toBe(true);
  });

  // Dastlabki ro'yxatda yo'q edi, keyin bazadan tasdiqlanib qo'shildi.
  it("keyin qo'shilgan mamlakatlarni ham taniydi", () => {
    expect(isCountry('die U.S.A.')).toBe(true);
    expect(isCountry('der Irak')).toBe(true);
    expect(isCountry('die Türkei')).toBe(true);
    expect(isCountry('Ungarn')).toBe(true);
  });
});

describe('isContinent', () => {
  // Xuddi mamlakatlar kabi: Flux qit'a shaklini/xaritasini xato chizadi.
  it("qit'a nomini taniydi", () => {
    expect(isContinent('Afrika')).toBe(true);
    expect(isContinent('Europa')).toBe(true);
    expect(isContinent('Asien')).toBe(true);
    expect(isContinent('Australien')).toBe(true);
    expect(isContinent('Deutschland')).toBe(false);
  });

  // Haqiqiy bazada "Amerika" yolg'iz emas — qismlarini sanovchi qavs
  // bilan keladi: "Amerika (Nord-, Mittel-, Südamerika)".
  it("qavs ichidagi izohni tashlab qit'ani taniydi", () => {
    expect(isContinent('Amerika (Nord-, Mittel-, Südamerika)')).toBe(true);
  });

  it("A1 dagi 5 ta qit'ani qamraydi", () => {
    for (const c of ['Afrika', 'Amerika', 'Asien', 'Australien', 'Europa'])
      expect(CONTINENTS.has(c)).toBe(true);
  });
});

describe('isGeographicProperNoun', () => {
  it("mamlakat YOKI qit'a bo'lsa true qaytaradi", () => {
    expect(isGeographicProperNoun('Deutschland')).toBe(true);
    expect(isGeographicProperNoun('Europa')).toBe(true);
    expect(isGeographicProperNoun('der Apfel')).toBe(false);
  });
});

describe('isNumberWord', () => {
  it('sodda son so`zlarini taniydi', () => {
    expect(isNumberWord('zwei')).toBe(true);
    expect(isNumberWord('null')).toBe(true);
    expect(isNumberWord('zwölf')).toBe(true);
  });

  it("qo'shma son so'zlarini taniydi", () => {
    expect(isNumberWord('siebenundsiebzig')).toBe(true);
    expect(isNumberWord('zweihundert')).toBe(true);
  });

  // Bazada "101" aynan shu qavsli shaklda yozilgan.
  it("qavs ichidagi muqobil shaklni ('und') qo'shib o'qiydi", () => {
    expect(isNumberWord('hundert(und)eins')).toBe(true);
  });

  // ICHIDA "zahl" bo'lgani uchun noto'g'ri ushlanmasligi kerak — bu
  // ANIQ so'z solishtiruvi, pastki qator qidiruvi emas.
  it("son bo'lmagan so'zni sonning bir qismi deb aralashtirmaydi", () => {
    expect(isNumberWord('die Postleitzahl')).toBe(false);
    expect(isNumberWord('der Apfel')).toBe(false);
  });
});

describe('isNumeric', () => {
  // Bularning o'zi son emas, sonlash haqidagi mavhum ot — lekin ularga
  // ham (matn taqiqi tufayli) rasm chizib bo'lmaydi.
  it('son tushunchasi haqidagi otlarni ham ushlaydi', () => {
    expect(isNumeric('die Zahl (Zahlen)')).toBe(true);
    expect(isNumeric('die Nummer (Nummern)')).toBe(true);
  });

  it('oddiy konkret otni son deb hisoblamaydi', () => {
    expect(isNumeric('das Zimmer (Zimmer)')).toBe(false);
  });
});

describe('isPhrase', () => {
  it('gap tugash belgisi bilan tugagan yozuvni ibora deb taniydi', () => {
    expect(isPhrase('Wie heißt du?')).toBe(true);
    expect(isPhrase('Guten Tag!')).toBe(true);
    expect(isPhrase('Ich heiße…')).toBe(true);
  });

  it("'/' bilan ikki shakl bergan yozuvni ibora deb taniydi", () => {
    expect(isPhrase('Ich bin Student/Studentin')).toBe(true);
  });

  // Qavsli ko'plik ibora emas — u oddiy ot, chizsa bo'ladi.
  it("qavsli ko'plikni ibora deb hisoblamaydi", () => {
    expect(isPhrase('das Land (die Länder)')).toBe(false);
    expect(isPhrase('der Apfel')).toBe(false);
  });
});

describe('isNeverPicturable', () => {
  it("mamlakat, qit'a, son va iborani birlashtirib ushlaydi", () => {
    expect(isNeverPicturable('Deutschland')).toBe(true);
    expect(isNeverPicturable('Europa')).toBe(true);
    expect(isNeverPicturable('zwei')).toBe(true);
    expect(isNeverPicturable('Wie heißt du?')).toBe(true);
    expect(isNeverPicturable('der Apfel')).toBe(false);
  });
});

describe('applyNeverPicturableRule', () => {
  // Bu haqiqiy chaqiruv yo'lidan o'tadigan tekshiruv: mark-picturable
  // skripti model/eski fayldan "true" deb o'qigan bo'lsa ham, bu filtr
  // SO'ZSIZ qo'llanadi. Filtr faqat so'rov matni ichida bo'lganda, u
  // allaqachon yozilgan (eski, qoidasiz) faylga hech qachon ta'sir
  // qilmasdi — bu reja davomida bir necha marta chiqqan xato naqshi.
  it("model yoki eski fayl 'true' deb yozgan bo'lsa ham, mamlakat/son/iborani false ga qaytaradi", () => {
    const items = [
      { sourceId: 'a', de: 'Deutschland' },
      { sourceId: 'b', de: 'zwei' },
      { sourceId: 'c', de: 'Wie heißt du?' },
      { sourceId: 'd', de: 'der Apfel' },
    ];
    // Xuddi eski, qoidasiz bosqichda model/fayl noto'g'ri "true" deb
    // yozib qo'ygandek simulyatsiya qilinadi.
    const staleResult = { a: true, b: true, c: true, d: true };

    expect(applyNeverPicturableRule(items, staleResult)).toEqual({
      a: false,
      b: false,
      c: false,
      d: true,
    });
  });
});

describe('parsePicturable', () => {
  it('ha/yo`q javobini o`qiydi', () => {
    expect(parsePicturable('1. ha\n2. yo`q\n3. ha', 3)).toEqual([
      true,
      false,
      true,
    ]);
  });

  // Javob soni so'ralganidan farq qilsa, qaysi so'zga qaysi javob
  // tegishli ekani noma'lum bo'lib qoladi.
  it('javob soni mos kelmasa yiqiladi', () => {
    expect(() => parsePicturable('1. ha', 3)).toThrow(/3/);
  });
});

describe('buildPicturablePrompt', () => {
  it('nemischa va inglizchani birga beradi', () => {
    const p = buildPicturablePrompt([{ de: 'der Apfel', en: 'the apple' }]);
    expect(p).toContain('der Apfel');
    expect(p).toContain('the apple');
  });
});
