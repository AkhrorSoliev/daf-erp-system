import { UebungService } from './uebung.service';

/**
 * Seedlangan pseudo-tasodifiy generator (mulberry32) — `seans()`ga
 * `Math.random` o'rniga beriladi, shunda bir xil seed HAR DOIM bir xil
 * seans beradi. Faqat determinstik CI tekshiruvi uchun (Finding 3):
 * haqiqiy `Math.random`ga tayangan test har ishga tushishda boshqa
 * namunani sinaydi, ba'zida qoidani buzilishini SINAB HAM ko'rmaydi.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bazaning eng kichik soxta nusxasi. Prisma o'rniga: bizni servisning
 * mantig'i qiziqtiradi, Prisma emas.
 *
 * `dafLexeme.findMany` VA `dafLexemeState.findMany` `where`ni haqiqatda
 * hisobga oladi (boshqalari yo'q) — chunki ba'zi testlar aynan
 * SERVISNING SO'RAGAN filtri (masalan `PAAR` javobini bir unitga
 * cheklash, yoki qaytarish so'rovini `take`ga cheklash) to'g'ri
 * qurilganini tekshiradi. Qolgan modellar bunga muhtoj emas.
 */
function fakePrisma() {
  const lexeme = [
    {
      id: 1,
      de: 'hallo',
      uz: 'salom',
      artikel: null,
      anzeige: null,
      core: true,
      sectionId: 7,
      unitId: 1,
    },
    {
      id: 2,
      de: 'danke',
      uz: 'rahmat',
      artikel: null,
      anzeige: null,
      core: true,
      sectionId: 7,
      unitId: 1,
    },
    {
      id: 3,
      de: 'ich',
      uz: 'men',
      artikel: null,
      anzeige: null,
      core: true,
      sectionId: 7,
      unitId: 1,
    },
    {
      id: 4,
      de: 'du',
      uz: 'sen',
      artikel: null,
      anzeige: null,
      core: true,
      sectionId: 7,
      unitId: 1,
    },
    {
      id: 5,
      de: 'Name',
      uz: 'ism',
      artikel: 'der',
      anzeige: null,
      core: true,
      sectionId: 7,
      unitId: 1,
    },
    {
      id: 6,
      de: 'Guten Abend',
      uz: 'xayrli kech',
      artikel: null,
      anzeige: null,
      core: false,
      sectionId: 7,
      unitId: 1,
    },
    // Boshqa UNITning so'zi — hech qachon shu darsda ko'rsatilmaydi.
    // `PAAR` javobi shu so'zni nomlab "to'g'ri" bo'lib qolmasligini
    // sinash uchun kerak (Finding 1: unit-scoping).
    {
      id: 99,
      de: 'fremd',
      uz: 'begona',
      artikel: null,
      anzeige: null,
      core: true,
      sectionId: 77,
      unitId: 2,
    },
    // Tarjimasi yo'q so'z (`uz: null`) — sxemada `DafLexeme.uz` nullable.
    // Unit 1 to'liq tarjima qilingan, lekin 2–12-unitlarda va eski DiB
    // so'zlarida bunday qatorlar bor. Bu so'z `core: true` va shu
    // bo'limda bo'lsa ham, savolga aylanmasligi SHART (Finding 5).
    {
      id: 7,
      de: 'unbekannt',
      uz: null,
      artikel: null,
      anzeige: null,
      core: true,
      sectionId: 7,
      unitId: 1,
    },
  ];
  const sentence = [
    { id: 11, de: 'Ich bin Anna.', uz: 'Men Annaman.', sectionId: 7 },
    { id: 12, de: 'Du bist Timur.', uz: 'Sen Timursan.', sectionId: 7 },
    { id: 13, de: 'Ich bin hier.', uz: 'Men bu yerdaman.', sectionId: 7 },
    { id: 14, de: 'Wie geht es dir?', uz: 'Ahvoling qanday?', sectionId: 7 },
  ];
  const phrase = [
    {
      id: 21,
      funktionUz: 'salomlashish',
      de: 'Hallo!',
      uz: 'Salom!',
      sectionId: 7,
    },
    {
      id: 22,
      funktionUz: 'xayrlashish',
      de: 'Tschüss!',
      uz: 'Xayr!',
      sectionId: 7,
    },
    {
      id: 23,
      funktionUz: 'minnatdorchilik',
      de: 'Danke!',
      uz: 'Rahmat!',
      sectionId: 7,
    },
    {
      id: 24,
      funktionUz: 'tanishtirish',
      de: 'Ich bin Anna.',
      uz: 'Men Annaman.',
      sectionId: 7,
    },
  ];

  return {
    attempts: [] as unknown[],
    states: new Map<number, { strength: number; dueAt: Date }>(),
    dafLesson: {
      findUnique: jest.fn(async () => ({
        id: 100,
        unitId: 1,
        sectionId: 7,
        kind: 'SECTION_A',
        section: { id: 7, code: 'u01-s1', order: 1, unitId: 1 },
      })),
    },
    dafSection: {
      findMany: jest.fn(async () => [{ id: 7, code: 'u01-s1', order: 1 }]),
    },
    dafLexeme: {
      findMany: jest.fn(async (args: any = {}) => {
        const where = args?.where ?? {};
        let rows = lexeme;
        if (where.sectionId?.in) {
          rows = rows.filter((l) => where.sectionId.in.includes(l.sectionId));
        }
        if (where.id?.in) {
          rows = rows.filter((l) => where.id.in.includes(l.id));
        }
        if (where.de?.in) {
          rows = rows.filter((l) => where.de.in.includes(l.de));
        }
        if (where.unitId != null) {
          rows = rows.filter((l) => l.unitId === where.unitId);
        }
        return rows;
      }),
      findUnique: jest.fn(
        async ({ where }: any) => lexeme.find((l) => l.id === where.id) ?? null,
      ),
    },
    dafSentence: {
      findMany: jest.fn(async () => sentence),
      findUnique: jest.fn(
        async ({ where }: any) =>
          sentence.find((s) => s.id === where.id) ?? null,
      ),
    },
    dafPhrase: {
      findMany: jest.fn(async () => phrase),
      findUnique: jest.fn(
        async ({ where }: any) => phrase.find((p) => p.id === where.id) ?? null,
      ),
    },
    dafLexemeState: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ id: 1 })),
    },
    dafAttempt: { create: jest.fn(async () => ({ id: 1 })) },
    dafLessonProgress: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ id: 1 })),
    },
    enrollment: { findFirst: jest.fn(async () => null) },
    // `tryResolveStudentBranchId` avval shu jadvalni so'raydi — bo'sh
    // qaytarilsa faol ro'yxatga (`enrollment`) tushadi.
    studentBranch: { findFirst: jest.fn(async () => null) },
  };
}

describe('UebungService.seans', () => {
  it('savol beradi va to`g`ri javobni YUBORMAYDI', async () => {
    const prisma = fakePrisma();
    const fragen = await new UebungService(prisma as any).seans(100, 55);

    expect(fragen.length).toBeGreaterThan(0);
    for (const f of fragen) {
      expect(Object.keys(f)).not.toContain('richtig');
      expect(Object.keys(f)).not.toContain('akzeptiert');
    }
  });

  it('passiv so`zni so`ramaydi', async () => {
    const prisma = fakePrisma();
    const fragen = await new UebungService(prisma as any).seans(100, 55);
    const soralgan = fragen
      .filter((f) => f.itemType === 'WORT')
      .map((f) => f.itemId);
    // 6 — `core: false`, ya'ni faqat matnda uchraydi.
    expect(soralgan).not.toContain(6);
  });

  // Finding 5: `DafLexeme.uz` sxemada nullable — tarjimasi yo'q so'zdan
  // (id 7) savol qurilsa `prompt`/`options`da `null` chiqib, `pruefen`
  // `normalisieren(null)`da yiqilardi. Bunday so'z materialga aylanish
  // bosqichidayoq chiqarib tashlanishi kerak, xato tashlanmasdan.
  it('tarjimasi yo`q so`zdan savol qurmaydi, xato tashlamaydi', async () => {
    const prisma = fakePrisma();
    const fragen = await new UebungService(prisma as any).seans(100, 55);
    const soralgan = fragen
      .filter((f) => f.itemType === 'WORT')
      .map((f) => f.itemId);
    expect(soralgan).not.toContain(7);
    // Hech qayerda `null` chiqmasligi ham tekshiriladi — `prompt`/`hilfe`/
    // `options` ichida.
    for (const f of fragen) {
      expect(f.prompt).not.toBeNull();
      expect(f.options).not.toContain(null);
    }
  });

  it('savollar tartib raqamiga ega', async () => {
    const prisma = fakePrisma();
    const fragen = await new UebungService(prisma as any).seans(100, 55);
    expect(fragen.map((f) => f.index)).toEqual(fragen.map((_, i) => i));
  });

  it('dars topilmasa xato tashlaydi', async () => {
    const prisma = fakePrisma();
    // `as any`: boshqa test holatidan farqli obyekt qaytaradi (`null`),
    // dastlabki `jest.fn` esa aniq tur bilan chiqarilgan edi.
    prisma.dafLesson.findUnique = jest.fn(async () => null) as any;
    await expect(
      new UebungService(prisma as any).seans(999, 55),
    ).rejects.toThrow();
  });

  it('dars bor, lekin bo`limi yo`q bo`lsa (eski DiB darsi) bo`sh massiv qaytaradi, xato tashlamaydi', async () => {
    // Bu dars XATO EMAS — u yangi dvigatel migratsiyasidan oldingi.
    // Mijoz `seans.data.length === 0`ni ko'rib eski `LernenLessonPage`ga
    // qaytadi, shuning uchun server bu yerda 404 emas, bo'sh massiv
    // qaytarishi kerak (Finding I3).
    const prisma = fakePrisma();
    prisma.dafLesson.findUnique = jest.fn(async () => ({
      id: 100,
      unitId: 1,
      sectionId: null,
      kind: 'SECTION_A',
      section: null,
    })) as any;
    const fragen = await new UebungService(prisma as any).seans(100, 55);
    expect(fragen).toEqual([]);
  });
});

describe('UebungService.seans — qaytarish (wiederholung)', () => {
  it('muddati kelgan so`z seansga kiradi, ikkitadan oshmaydi va boshqa formatda so`raladi', async () => {
    const prisma = fakePrisma();
    const eski = new Date(Date.now() - 60_000);
    // Uchta muddati kelgan so'z beriladi — cheklov ikkita ekanini
    // ko'rish uchun ataylab ko'proq.
    prisma.dafLexemeState.findMany = jest.fn(async ({ take }: any) =>
      [
        { lexemeId: 1, lastFormat: 'WORT_UZ', dueAt: eski },
        { lexemeId: 2, lastFormat: 'UZ_WORT', dueAt: eski },
        { lexemeId: 3, lastFormat: 'WORT_UZ', dueAt: eski },
      ].slice(0, take),
    ) as any;

    const fragen = await new UebungService(prisma as any).seans(100, 55);

    // 12 savollik seansda oltidan biri — ya'ni ikkitasi so'raladi.
    // Servis buni SO'ROVNING O'ZIDA cheklaydi (`take: 2`), uchinchi
    // holat bazadan umuman tortib olinmaydi.
    const chaqiruv = (prisma.dafLexemeState.findMany as jest.Mock).mock
      .calls[0][0];
    expect(chaqiruv.take).toBe(2);

    // Ikkala muddati kelgan so'z (1 va 2) seansda ko'rinadi.
    const soz1 = fragen.find((f) => f.itemType === 'WORT' && f.itemId === 1);
    const soz2 = fragen.find((f) => f.itemType === 'WORT' && f.itemId === 2);
    expect(soz1).toBeDefined();
    expect(soz2).toBeDefined();

    // 1-so'z oxirgi marta WORT_UZ da so'ralgan (artikli yo'q, shuning
    // uchun ARTIKEL formatini qura olmaydi) — yagona qolgan muqobil
    // UZ_WORT, demak aynan shu formatda qaytishi SHART.
    expect(soz1?.format).toBe('UZ_WORT');
    // 2-so'z oxirgi marta UZ_WORT da so'ralgan — xuddi shu sababdan
    // yagona muqobil WORT_UZ.
    expect(soz2?.format).toBe('WORT_UZ');
  });

  // Finding 4 / dizayn qoidasi 5: ketma-ket ikki SEANSDA bir xil
  // (so'z+format) juftligi takrorlanmaydi. Bu — ODDIY (qaytarish
  // ro'yxatida bo'lmagan) so'zlar uchun ham amal qilishi kerak: agar
  // so'z 1 ('hallo') o'tgan safar WORT_UZ formatida so'ralgan bo'lsa
  // (lekin hozir muddati kelgan emas — oddiy nomzod sifatida qatnashadi),
  // bu safar u WORT_UZ sifatida QURILMAYDI ham — demak kandidaten
  // panelida bunday nomzod umuman yo'q, seans uni tanlab OLOLMAYDI.
  //
  // BU TEST AVVAL HAQIQIY `Math.random`GA TAYANARDI (Finding 3 —
  // qayta ko'rikdan o'tkazish): 2000 marta ishga tushirilganda,
  // taqiqlangan format aslida 38% holatda namunaga tushar, so'z esa
  // 15%da seansda UMUMAN chiqmasdi — ikkalasida ham tekshiruv jimgina
  // "o'tib" ketardi. Endi SEEDLANGAN generator beriladi: natija HAR
  // DOIM bir xil (seed=0 bilan so'z 1 UZ_WORT sifatida chiqishi
  // oldindan tekshirilgan), shuning uchun CI'da barqaror va ikkinchi
  // shart (so'zning seansda haqiqatda BORLIGI) ham endi tasdiqlanadi —
  // aks holda ichki `for` sikli bo'sh massivda bekorga "o'tib" ketardi.
  it('oddiy so`zning ham avvalgi formatidagi nomzodi qurilmaydi (dizayn qoidasi 5)', async () => {
    const prisma = fakePrisma();
    prisma.dafLexemeState.findMany = jest.fn(async (args: any) => {
      const where = args?.where ?? {};
      if (where.dueAt) return []; // bu testda muddati kelgan so'z yo'q
      if (where.lexemeId?.in) {
        // 1-so'z ('hallo') o'tgan SEANSda WORT_UZ formatida so'ralgan edi.
        return [{ lexemeId: 1, lastFormat: 'WORT_UZ' }];
      }
      return [];
    }) as any;

    const fragen = await new UebungService(prisma as any).seans(
      100,
      55,
      mulberry32(0),
    );
    const soz1Savollari = fragen.filter(
      (f) => f.itemType === 'WORT' && f.itemId === 1,
    );
    // So'z 1 seansda HAQIQATDA chiqadi — aks holda pastdagi tekshiruv
    // bo'sh massivda vaqinchalik "o'tib" ketgan bo'lardi.
    expect(soz1Savollari.length).toBeGreaterThan(0);
    // Chiqsa ham — hech qachon WORT_UZ formatida emas, chunki bu format
    // uning uchun kandidaten ro'yxatiga UMUMAN kiritilmagan.
    for (const f of soz1Savollari) {
      expect(f.format).not.toBe('WORT_UZ');
    }
  });

  // Finding 5, qaytarish yo'lidagi hodisasi: muddati kelgan so'zning
  // o'zi tarjimasiz bo'lsa (id 7 — `uz: null`), `baueWiederholung` xato
  // tashlamasdan uni tashlab ketishi kerak.
  it('muddati kelgan so`z tarjimasiz bo`lsa, xato tashlamay tashlab ketadi', async () => {
    const prisma = fakePrisma();
    const eski = new Date(Date.now() - 60_000);
    prisma.dafLexemeState.findMany = jest.fn(async ({ take }: any) =>
      [{ lexemeId: 7, lastFormat: null, dueAt: eski }].slice(0, take),
    ) as any;

    const fragen = await new UebungService(prisma as any).seans(100, 55);
    expect(fragen.filter((f) => f.itemId === 7)).toHaveLength(0);
  });
});

describe('wiederholung', () => {
  function fakeMitDue(count: number) {
    const prisma = fakePrisma();
    const states = Array.from({ length: count }, (_, i) => ({
      lexemeId: i + 1,
      lastFormat: null,
      dueAt: new Date(Date.now() - 1000),
    }));
    prisma.dafLexemeState.findMany = jest.fn(async () => states) as any;
    prisma.dafLexeme.findMany = jest.fn(async () =>
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        de: `Wort${i + 1}`,
        uz: `soz${i + 1}`,
        artikel: null,
        anzeige: null,
        sectionId: null,
        core: true,
      })),
    ) as any;
    return prisma;
  }

  it("muddati kelgan so'z yo'q bo'lsa bo'sh ro'yxat — bu XATO EMAS", async () => {
    const prisma = fakePrisma();
    prisma.dafLexemeState.findMany = jest.fn(async () => []) as any;
    await expect(
      new UebungService(prisma as any).wiederholung(55),
    ).resolves.toEqual([]);
  });

  it("ko'pi bilan 12 savol qaytaradi", async () => {
    const fragen = await new UebungService(fakeMitDue(40) as any).wiederholung(
      55,
    );
    expect(fragen.length).toBeLessThanOrEqual(12);
    expect(fragen.length).toBeGreaterThan(0);
  });

  it("faqat MUDDATI KELGAN so'zlarni so'raydi", async () => {
    // Ikkita so'rov navbati AMALGA OSHISH TARTIBI emas — muhimi, ULARDAN
    // BIRI muddati kelganlar bo'yicha filtrlaydi. `wiederholung()` endi
    // chalg'ituvchi puli uchun ALOHIDA (muddatsiz) so'rov ham yuboradi,
    // shuning uchun BIRINCHI chaqiruvni tekshirish o'rniga BARCHA
    // chaqiruvlar orasidan muddati kelgan filtrli birini qidiramiz.
    const prisma = fakeMitDue(20);
    await new UebungService(prisma as any).wiederholung(55);
    const calls = (prisma.dafLexemeState.findMany as jest.Mock).mock.calls;
    const dueChaqiruv = calls.find((c) => c[0]?.where?.dueAt);
    expect(dueChaqiruv).toBeDefined();
    expect(dueChaqiruv![0].where.studentId).toBe(55);
    expect(dueChaqiruv![0].where.dueAt).toHaveProperty('lte');
  });

  // Haqiqiy nuqson: chalg'ituvchi puli FAQAT muddati kelgan so'zlardan
  // olinsa, `ablenker` (wort-fragen.ts) kamida 3 ta BOSHQA qiymat topa
  // olmaguncha `null` qaytaradi — ozgina so'z muddati kelgan kunda
  // (bu ODATIY holat, kamdan-kam emas) deyarli har bir savol "qurib
  // bo'lmadi" deb tashlab yuboriladi. Uzoq tarixli o'quvchi (o'nlab
  // so'z bilan tanish) ham shu sababdan bo'sh seans olib qolardi.
  //
  // `dafLexeme.findMany` bu yerda `where.id.in`ni HAQIQATDA hisobga
  // oladi (boshqa testlardagi `fakeMitDue` kabi argumentni e'tiborsiz
  // qoldirmaydi) — aks holda chalg'ituvchi puli tor bo'lsa ham keng
  // bo'lsa ham natija farq qilmay, bu test hech narsani isbotlamas edi.
  it("uzoq tarixli o'quvchida ozgina muddati kelgan so'z bo'lsa ham, savollar qaytaradi", async () => {
    const now = Date.now();
    const eski = new Date(now - 1000);
    const kelajakda = new Date(now + 999_999);
    // 15 ta so'z bilan tanish (holat yozuvi bor), lekin faqat 3 tasi
    // bugun muddati kelgan — qolgan 12 tasi hali muddati kelmagan.
    const barchaHolatlar = Array.from({ length: 15 }, (_, i) => ({
      lexemeId: i + 1,
      lastFormat: null,
      dueAt: i < 3 ? eski : kelajakda,
    }));
    const barchaSozlar = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      de: `Wort${i + 1}`,
      uz: `soz${i + 1}`,
      artikel: null,
      anzeige: null,
      sectionId: null,
      core: true,
    }));

    const prisma = fakePrisma();
    prisma.dafLexemeState.findMany = jest.fn(async (args: any) => {
      const where = args?.where ?? {};
      if (where.dueAt) {
        return barchaHolatlar.filter((z) => z.dueAt.getTime() <= now);
      }
      return barchaHolatlar;
    }) as any;
    prisma.dafLexeme.findMany = jest.fn(async (args: any) => {
      const ids: number[] | undefined = args?.where?.id?.in;
      if (!ids) return barchaSozlar;
      return barchaSozlar.filter((s) => ids.includes(s.id));
    }) as any;

    const fragen = await new UebungService(prisma as any).wiederholung(55);
    // Uchta so'z muddati kelgan — hammasi savolga aylanishi kerak,
    // chunki chalg'ituvchi puli endi 15 ta so'zdan (kengroq, faqat
    // 3 tadan emas) tuziladi.
    expect(fragen).toHaveLength(3);
  });

  it("bitta so'z ikki marta so'ralmaydi", async () => {
    const fragen = await new UebungService(fakeMitDue(30) as any).wiederholung(
      55,
    );
    const ids = fragen.map((f) => `${f.itemType}:${f.itemId}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("to'g'ri javobni YUBORMAYDI", async () => {
    const fragen = await new UebungService(fakeMitDue(20) as any).wiederholung(
      55,
    );
    for (const f of fragen) {
      expect(Object.keys(f)).not.toContain('richtig');
      expect(Object.keys(f)).not.toContain('akzeptiert');
    }
  });

  it("savol qurib bo'lmaydigan so'zlar seansni yiqitmaydi", async () => {
    // Tarjimasi yo'q so'zdan savol qurilmaydi — u tashlab ketiladi,
    // ekzeptsiya tashlanmaydi.
    const prisma = fakeMitDue(5);
    prisma.dafLexeme.findMany = jest.fn(async () => [
      {
        id: 1,
        de: 'Wort1',
        uz: null,
        artikel: null,
        anzeige: null,
        sectionId: null,
        core: true,
      },
    ]) as any;
    await expect(
      new UebungService(prisma as any).wiederholung(55),
    ).resolves.toEqual([]);
  });
});

describe('UebungService.pruefen', () => {
  const ctx = { studentId: 55, companyId: 1 };

  it('to`g`ri javobni qabul qiladi va to`g`ri javobni qaytaradi', async () => {
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 1, format: 'WORT_UZ', given: 'salom' },
      ctx,
    );
    expect(r.isCorrect).toBe(true);
    expect(r.richtig).toBe('salom');
  });

  it('imlo farqini kechiradi', async () => {
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).pruefen(
      {
        itemType: 'PHRASE',
        itemId: 22,
        format: 'REAKTION',
        given: 'Tschuess!',
      },
      ctx,
    );
    expect(r.isCorrect).toBe(true);
  });

  it('xato javobni rad etadi', async () => {
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 1, format: 'WORT_UZ', given: 'rahmat' },
      ctx,
    );
    expect(r.isCorrect).toBe(false);
  });

  it('urinishni yozadi', async () => {
    const prisma = fakePrisma();
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 1, format: 'WORT_UZ', given: 'salom' },
      ctx,
    );
    expect(prisma.dafAttempt.create).toHaveBeenCalled();
    const arg = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0];
    expect(arg.data.studentId).toBe(55);
    expect(arg.data.lexemeId).toBe(1);
    expect(arg.data.isCorrect).toBe(true);
  });

  it('so`z holatini yangilaydi', async () => {
    const prisma = fakePrisma();
    const oldin = Date.now();
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 1, format: 'WORT_UZ', given: 'salom' },
      ctx,
    );
    expect(prisma.dafLexemeState.upsert).toHaveBeenCalled();

    // Faqat chaqirilganini emas — YUKINI ham tekshiramiz: yangi so'z
    // (holat topilmadi, `strength` 0 dan boshlanadi) + to'g'ri javob —
    // kuch 1ga o'sadi, muddat kelajakka suriladi, format keyingi
    // qaytarish uchun yoziladi.
    const arg = (prisma.dafLexemeState.upsert as jest.Mock).mock.calls[0][0];
    expect(arg.where.studentId_lexemeId).toEqual({
      studentId: 55,
      lexemeId: 1,
    });
    expect(arg.create.strength).toBe(1);
    expect(arg.create.dueAt.getTime()).toBeGreaterThan(oldin);
    expect(arg.create.lastFormat).toBe('WORT_UZ');
    expect(arg.update.strength).toBe(1);
    expect(arg.update.lastFormat).toBe('WORT_UZ');
  });

  it('gap javobida so`z holati yangilanmaydi', async () => {
    // Holat SO'ZGA bog'langan; gap javobi qaysi so'zni bilishini aytmaydi.
    const prisma = fakePrisma();
    await new UebungService(prisma as any).pruefen(
      {
        itemType: 'SATZ',
        itemId: 11,
        format: 'SATZ_UEBERSETZEN',
        given: 'Men Annaman.',
      },
      ctx,
    );
    expect(prisma.dafLexemeState.upsert).not.toHaveBeenCalled();
  });

  it('mavjud bo`lmagan materialga xato tashlaydi', async () => {
    const prisma = fakePrisma();
    await expect(
      new UebungService(prisma as any).pruefen(
        { itemType: 'WORT', itemId: 999, format: 'WORT_UZ', given: 'salom' },
        ctx,
      ),
    ).rejects.toThrow();
  });

  it('PAAR: har juftni alohida tekshiradi, hammasi to`g`ri bo`lsa qabul qiladi', async () => {
    // `itemId` faqat ma'lumot: tekshiruv har juftni (de=uz) mustaqil
    // baholaydi, savolda qaysi to'rtlik ko'rsatilganini bilmasdan.
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).pruefen(
      {
        itemType: 'WORT',
        itemId: 1,
        format: 'PAAR',
        given: 'hallo=salom|danke=rahmat|ich=men|du=sen',
      },
      ctx,
    );
    expect(r.isCorrect).toBe(true);
  });

  it('PAAR: bitta noto`g`ri juft butun javobni rad etadi', async () => {
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).pruefen(
      {
        itemType: 'WORT',
        itemId: 1,
        format: 'PAAR',
        given: 'hallo=rahmat|danke=salom|ich=men|du=sen',
      },
      ctx,
    );
    expect(r.isCorrect).toBe(false);
  });

  it('PAAR: to`rttadan farqli juft soni xato hisoblanadi, ekzeptsiya emas', async () => {
    // Bitta TO'G'RI juft yuborilsa ham, to'rttadan kam bo'lgani uchun
    // butun javob XATO — qolgan uchtasi sinovdan o'tmagan deb hisoblanadi.
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 1, format: 'PAAR', given: 'hallo=salom' },
      ctx,
    );
    expect(r.isCorrect).toBe(false);
  });

  it('PAAR: boshqa unitdan so`z nomlansa qabul qilinmaydi', async () => {
    // "fremd=begona" tarjima sifatida TO'G'RI, lekin `fremd` boshqa
    // unitning so'zi — bu darsda hech qachon ko'rsatilmagan. So'z qidiruvi
    // shu unitga cheklangani uchun bu juft "topilmadi" deb hisoblanadi.
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).pruefen(
      {
        itemType: 'WORT',
        itemId: 1,
        format: 'PAAR',
        given: 'hallo=salom|danke=rahmat|ich=men|fremd=begona',
      },
      ctx,
    );
    expect(r.isCorrect).toBe(false);
  });

  it('PAAR: har so`zning holati faqat O`Z juftining natijasi bilan yangilanadi', async () => {
    // 'hallo' va 'ich' TO'G'RI juftlashgan, 'danke' va 'du' XATO
    // (tarjimalari almashtirilgan). Umumiy verdikt xato bo'lsa ham,
    // to'g'ri juftlashgan ikkita so'zning holati BUZILMASLIGI kerak.
    const prisma = fakePrisma();
    await new UebungService(prisma as any).pruefen(
      {
        itemType: 'WORT',
        itemId: 1,
        format: 'PAAR',
        given: 'hallo=salom|danke=sen|ich=men|du=rahmat',
      },
      ctx,
    );

    const calls = (prisma.dafLexemeState.upsert as jest.Mock).mock.calls;
    // To'rtta so'zning HAR BIRI o'zicha yangilanadi — umumiy verdikt
    // bilan bitta yozuv emas.
    expect(calls.length).toBe(4);

    const holatBoyicha = new Map(
      calls.map(([arg]: any) => [arg.where.studentId_lexemeId.lexemeId, arg]),
    );

    // 'hallo' (id 1) — to'g'ri juftlashgan: kuch o'sadi.
    expect(holatBoyicha.get(1).create.strength).toBe(1);
    expect(holatBoyicha.get(1).create.correctCount).toBe(1);
    expect(holatBoyicha.get(1).create.lastFormat).toBe('PAAR');

    // 'danke' (id 2) — noto'g'ri juftlashgan: kuch nolga tushadi.
    expect(holatBoyicha.get(2).create.strength).toBe(0);
    expect(holatBoyicha.get(2).create.wrongCount).toBe(1);

    // 'ich' (id 3) — to'g'ri juftlashgan: kuch o'sadi.
    expect(holatBoyicha.get(3).create.strength).toBe(1);

    // 'du' (id 4) — noto'g'ri juftlashgan: kuch nolga tushadi.
    expect(holatBoyicha.get(4).create.strength).toBe(0);
  });

  it('LUECKE endi SO`Z savoli sifatida tekshiriladi', async () => {
    // Dizayn o'zgardi: `luecke` endi bo'shatilgan so'zning o'zini
    // (`itemType: 'WORT'`) nishonlaydi, shuning uchun javob har qanday
    // boshqa so'z savoli kabi tekshiriladi va o'sha so'zning holati
    // yangilanadi.
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 1, format: 'LUECKE', given: 'hallo' },
      ctx,
    );
    expect(r.isCorrect).toBe(true);
    expect(r.richtig).toBe('hallo');
    expect(prisma.dafLexemeState.upsert).toHaveBeenCalled();
  });
});

describe('UebungService.ersatz', () => {
  it('shu material haqida boshqa formatda savol beradi', async () => {
    const prisma = fakePrisma();
    const f = await new UebungService(prisma as any).ersatz(
      100,
      55,
      'WORT',
      1,
      'WORT_UZ',
    );
    expect(f).not.toBeNull();
    expect(f!.itemId).toBe(1);
    expect(f!.format).not.toBe('WORT_UZ');
  });

  it('to`g`ri javobni YUBORMAYDI', async () => {
    const prisma = fakePrisma();
    const f = await new UebungService(prisma as any).ersatz(
      100,
      55,
      'WORT',
      1,
      'WORT_UZ',
    );
    expect(Object.keys(f!)).not.toContain('richtig');
    expect(Object.keys(f!)).not.toContain('akzeptiert');
  });

  it('nichtFormat yagona qurilgan nomzodning o`ziga to`g`ri kelsa, null qaytaradi', async () => {
    // Yagona so'z, artikli bor. `artikel()` chalg'ituvchi TALAB QILMAYDI
    // (variantlar har doim der/die/das) — shuning uchun yolg'iz so'z
    // bo'lsa ham quriladi. `wortUz`/`uzWort` esa boshqa so'zlardan farqli
    // 3 ta chalg'ituvchi talab qiladi va bitta so'zda buni topa olmaydi.
    // Demak bu material uchun FAQAT ARTIKEL nomzodi bor — va aynan
    // shu formatni `nichtFormat` sifatida so'raymiz. Bu testni `f.format
    // !== nichtFormat` filtri o'chirilganda ham "yashil" qiladigan avvalgi
    // versiyadan farqli o'laroq (u yerda materialdan UMUMAN nomzod
    // qurilmasdi), bu yerda filtr chindan ham ishlamasa natija `null`
    // EMAS, ARTIKEL savoli bo'lardi.
    const prisma = fakePrisma();
    prisma.dafLexeme.findMany = jest.fn(async () => [
      {
        id: 5,
        de: 'Name',
        uz: 'ism',
        artikel: 'der',
        anzeige: null,
        core: true,
        sectionId: 7,
      },
    ]) as any;
    prisma.dafSentence.findMany = jest.fn(async () => []) as any;
    prisma.dafPhrase.findMany = jest.fn(async () => []) as any;
    const f = await new UebungService(prisma as any).ersatz(
      100,
      55,
      'WORT',
      5,
      'ARTIKEL',
    );
    expect(f).toBeNull();
  });

  it('dars topilmasa xato tashlaydi', async () => {
    const prisma = fakePrisma();
    prisma.dafLesson.findUnique = jest.fn(async () => null) as any;
    await expect(
      new UebungService(prisma as any).ersatz(999, 55, 'WORT', 1, 'WORT_UZ'),
    ).rejects.toThrow();
  });

  it('dars bor, lekin bo`limi yo`q bo`lsa (eski DiB darsi) null qaytaradi, xato tashlamaydi', async () => {
    // Xuddi `seans` dagidek (Finding I3): bo'limsiz dars — mos o'rinbosar
    // yo'qligi bilan bir xil tabiiy holat, 404 emas.
    const prisma = fakePrisma();
    prisma.dafLesson.findUnique = jest.fn(async () => ({
      id: 100,
      unitId: 1,
      sectionId: null,
      kind: 'SECTION_A',
      section: null,
    })) as any;
    const f = await new UebungService(prisma as any).ersatz(
      100,
      55,
      'WORT',
      1,
      'WORT_UZ',
    );
    expect(f).toBeNull();
  });
});

describe('UebungService.abschluss', () => {
  const ctx = { studentId: 55, companyId: 1 };

  it('birinchi yakunda ilgarilashni yozadi', async () => {
    const prisma = fakePrisma();
    await new UebungService(prisma as any).abschluss(
      100,
      { richtig: 10, gesamt: 12, durationMs: 200000 },
      ctx,
    );
    const call = (prisma.dafLessonProgress.upsert as jest.Mock).mock
      .calls[0][0];
    expect(call.create.studentId).toBe(55);
    expect(call.create.lessonId).toBe(100);
    expect(call.create.bestScore).toBe(10);
    expect(call.create.runs).toBe(1);
    expect(call.create.completedAt).toBeInstanceOf(Date);
  });

  it('eng yaxshi ballni saqlaydi, oxirgisini emas', async () => {
    const prisma = fakePrisma();
    prisma.dafLessonProgress.findUnique = jest.fn(async () => ({
      id: 1,
      studentId: 55,
      lessonId: 100,
      bestScore: 11,
      runs: 2,
      completedAt: new Date(),
    })) as any;
    await new UebungService(prisma as any).abschluss(
      100,
      { richtig: 7, gesamt: 12 },
      ctx,
    );
    const call = (prisma.dafLessonProgress.upsert as jest.Mock).mock
      .calls[0][0];
    expect(call.update.bestScore).toBe(11);
    expect(call.update.runs).toBe(3);
  });

  it('gesamt noldan katta bo`lishini talab qiladi', async () => {
    const prisma = fakePrisma();
    await expect(
      new UebungService(prisma as any).abschluss(
        100,
        { richtig: 0, gesamt: 0 },
        ctx,
      ),
    ).rejects.toThrow();
  });

  it('richtig gesamtdan katta bo`lolmaydi', async () => {
    const prisma = fakePrisma();
    await expect(
      new UebungService(prisma as any).abschluss(
        100,
        { richtig: 13, gesamt: 12 },
        ctx,
      ),
    ).rejects.toThrow();
  });
});

describe('pruefen — ball', () => {
  const ctx = { studentId: 55, companyId: 1 };

  /**
   * `dafLexemeState`ni STATEFUL qiladi — `upsert` haqiqatda saqlanadigan
   * do'konga yozadi, `findMany`/`findUnique` esa O'SHA do'kondan o'qiydi.
   *
   * NEGA STATIK MOCK YETARLI EMAS. Static `jest.fn(async () => state)`
   * har doim BIR XIL qiymatni qaytaradi — qachon chaqirilishidan qat'i
   * nazar. Shuning uchun agar kimdir kelajakda `pruefen` ichida muddat
   * o'qishni `aktualisiereZustand` yozuvidan PASTGA surib qo'ysa (aynan
   * shu vazifa oldini olishi kerak bo'lgan regressiya), static mock buni
   * SEZMAYDI: natija bayt-baytiga bir xil chiqadi va test o'tib ketadi.
   * Do'kon orqali `upsert` yozgan qiymat `findMany` ga haqiqatda ta'sir
   * qilgani uchun, tartib buzilsa "muddati kelgan" holat allaqachon
   * kelajakka surilgan bo'lib topiladi va ball 10 o'rniga 0 chiqadi.
   */
  function fakeMitWort(state: { dueAt: Date; strength: number } | null) {
    const prisma = fakePrisma();
    prisma.dafLexeme.findUnique = jest.fn(async () => ({
      id: 5,
      de: 'das Haus',
      uz: 'uy',
      artikel: 'das',
      unitId: 1,
    })) as any;

    const zustandStore = new Map<number, { dueAt: Date; strength: number }>();
    if (state) zustandStore.set(5, state);

    prisma.dafLexemeState.findMany = jest.fn(async ({ where }: any) => {
      const ids: number[] = where?.lexemeId?.in ?? [];
      return ids
        .filter((id) => zustandStore.has(id))
        .map((id) => ({ lexemeId: id, ...zustandStore.get(id)! }));
    }) as any;

    prisma.dafLexemeState.findUnique = jest.fn(async ({ where }: any) => {
      const lexemeId = where.studentId_lexemeId.lexemeId;
      return zustandStore.get(lexemeId) ?? null;
    }) as any;

    prisma.dafLexemeState.upsert = jest.fn(async (args: any) => {
      const lexemeId = args.where.studentId_lexemeId.lexemeId;
      // `dueAt`/`strength` `create` va `update` shoxobchalarida bir xil
      // hisoblangan qiymat — qaysinisidan olinishi farq qilmaydi.
      const yangi = args.update ?? args.create;
      zustandStore.set(lexemeId, {
        dueAt: yangi.dueAt,
        strength: yangi.strength,
      });
      return { id: 1 };
    }) as any;

    return prisma;
  }

  // TARTIB TRIPWIRE (1/2): `fakeMitWort` endi STATEFUL, ya'ni
  // `aktualisiereZustand`ning `upsert`i shu yerdagi `findMany`ga
  // haqiqatda ta'sir qiladi. Agar `pruefen` ichida muddat o'qishni
  // yozuvdan PASTGA surib qo'yishsa: bu yerda hali state yo'q edi, lekin
  // to'g'ri javob `aktualisiereZustand`da YANGI (kelajakdagi) `dueAt`
  // bilan qator yozadi — o'qish o'sha yozuvdan KEYIN sodir bo'lsa, so'z
  // "muddati kelmagan" ko'rinadi va bu test 10 o'rniga 0 kutadi, ya'ni
  // MUVAFFAQIYATSIZ tugaydi.
  it("hech qachon so'ralmagan so'z — 10 ball", async () => {
    const prisma = fakeMitWort(null);
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy' },
      ctx,
    );
    const call = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0];
    expect(call.data.points).toBe(10);
  });

  // TARTIB TRIPWIRE (2/2): boshlang'ich `dueAt` O'TGANDA turibdi (muddati
  // kelgan). Agar o'qish yozuvdan KEYIN sodir bo'lsa, `aktualisiereZustand`
  // to'g'ri javob uchun `dueAt`ni KELAJAKKA surib ulguradi va shu yerdagi
  // o'qish endi "muddati kelmagan" deb topadi — kutilgan 10 o'rniga 0
  // chiqib, test MUVAFFAQIYATSIZ tugaydi. Bu ikkala test ham quyidagi
  // fix hisobotida qo'lda sinalgan: o'qishni yozuvdan pastga surib
  // ikkalasi ham qulashi, keyin qaytarib ikkalasi ham o'tishi tasdiqlangan.
  it('muddati kelgan so`z — 10 ball', async () => {
    const prisma = fakeMitWort({
      strength: 2,
      dueAt: new Date(Date.now() - 60_000),
    });
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy' },
      ctx,
    );
    const call = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0];
    expect(call.data.points).toBe(10);
  });

  it("muddati KELMAGAN so'z — nol ball (darsni qayta o'tish)", async () => {
    const prisma = fakeMitWort({
      strength: 2,
      dueAt: new Date(Date.now() + 3 * 86_400_000),
    });
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy' },
      ctx,
    );
    const call = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0];
    expect(call.data.points).toBe(0);
  });

  it('xato javob — nol ball', async () => {
    const prisma = fakeMitWort(null);
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'notogri' },
      ctx,
    );
    const call = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0];
    expect(call.data.points).toBe(0);
  });

  it('gap savoli — nol ball (Leitner gapni kuzatmaydi)', async () => {
    const prisma = fakePrisma();
    prisma.dafSentence.findUnique = jest.fn(async () => ({
      de: 'Ich bin da',
      uz: 'Men shu yerdaman',
    })) as any;
    await new UebungService(prisma as any).pruefen(
      {
        itemType: 'SATZ',
        itemId: 9,
        format: 'SATZ_UEBERSETZEN',
        given: 'Men shu yerdaman',
      },
      ctx,
    );
    const call = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0];
    expect(call.data.points).toBe(0);
  });

  it('urinishga filial va guruh MUHRLANADI', async () => {
    const prisma = fakeMitWort(null);
    prisma.enrollment.findFirst = jest.fn(async () => ({
      groupId: 'g-1',
    })) as any;
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy' },
      ctx,
    );
    const data = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0].data;
    expect(data.groupId).toBe('g-1');
    expect(data).toHaveProperty('branchId');
  });
});

describe('PAAR — ball ko`paytmasi (Fix 1: bitta so`z to`rt marta ballanmaydi)', () => {
  const ctx = { studentId: 55, companyId: 1 };

  /**
   * `dafLexemeState`ni BIR NECHTA so'z uchun STATEFUL qiladi — "aralash"
   * testda ba'zi so'zlar muddati kelgan, ba'zilari kelmagan bo'lishi
   * kerak, buni faqat haqiqiy do'kon beradi (`fakeMitWort`ning yagona
   * so'zga mo'ljallangan nusxasi buni qila olmaydi).
   */
  function fakeMitWoerterState(
    holatlar: Record<number, { dueAt: Date; strength: number } | undefined>,
  ) {
    const prisma = fakePrisma();
    const zustandStore = new Map<number, { dueAt: Date; strength: number }>();
    for (const [id, holat] of Object.entries(holatlar)) {
      if (holat) zustandStore.set(Number(id), holat);
    }

    prisma.dafLexemeState.findMany = jest.fn(async ({ where }: any) => {
      const ids: number[] = where?.lexemeId?.in ?? [];
      return ids
        .filter((id) => zustandStore.has(id))
        .map((id) => ({ lexemeId: id, ...zustandStore.get(id)! }));
    }) as any;

    prisma.dafLexemeState.findUnique = jest.fn(async ({ where }: any) => {
      const lexemeId = where.studentId_lexemeId.lexemeId;
      return zustandStore.get(lexemeId) ?? null;
    }) as any;

    prisma.dafLexemeState.upsert = jest.fn(async (args: any) => {
      const lexemeId = args.where.studentId_lexemeId.lexemeId;
      const yangi = args.update ?? args.create;
      zustandStore.set(lexemeId, {
        dueAt: yangi.dueAt,
        strength: yangi.strength,
      });
      return { id: 1 };
    }) as any;

    return prisma;
  }

  it('to`rtta ANIQ muddati kelgan so`z — 40 ball (4 x 10)', async () => {
    // hallo(1)/danke(2)/ich(3)/du(4) — hech qaysi holati yo'q, ya'ni
    // hammasi muddati kelgan (`istFaellig`: holatsiz so'z = muddati kelgan).
    const prisma = fakePrisma();
    await new UebungService(prisma as any).pruefen(
      {
        itemType: 'WORT',
        itemId: 1,
        format: 'PAAR',
        given: 'hallo=salom|danke=rahmat|ich=men|du=sen',
      },
      ctx,
    );
    const call = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0];
    expect(call.data.points).toBe(40);
  });

  // FINDING 1 (CRITICAL): bitta so'zni to'rt marta yuborib, uni to'rt
  // marta ballash — va Leitner holatini bir so'rovda 0→1→2→3→4 qilib
  // surib yuborish. Ushbu test FIX'DAN OLDIN qizil (40 ball, 4 marta
  // upsert), FIX'DAN KEYIN yashil (0 ball — malformed javob, hech
  // bo'lmasa bitta upsert) bo'lishi kutiladi. Natijalar hisobotda.
  it('bitta so`zni to`rt marta yuborish — 0 ball, holat ko`pi bilan BIR MARTA yangilanadi', async () => {
    const prisma = fakePrisma();
    await new UebungService(prisma as any).pruefen(
      {
        itemType: 'WORT',
        itemId: 1,
        format: 'PAAR',
        given: 'hallo=salom|hallo=salom|hallo=salom|hallo=salom',
      },
      ctx,
    );
    const call = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0];
    expect(call.data.points).toBe(0);
    expect(
      (prisma.dafLexemeState.upsert as jest.Mock).mock.calls.length,
    ).toBeLessThanOrEqual(1);
  });

  it('aralash: ikkitasi muddati kelgan, ikkitasi kelmagan — faqat kelganlar uchun 20 ball', async () => {
    const eski = new Date(Date.now() - 60_000);
    const kelajak = new Date(Date.now() + 3 * 86_400_000);
    // hallo(1), danke(2) — muddati kelgan; ich(3), du(4) — hali emas.
    const prisma = fakeMitWoerterState({
      1: { strength: 2, dueAt: eski },
      2: { strength: 2, dueAt: eski },
      3: { strength: 2, dueAt: kelajak },
      4: { strength: 2, dueAt: kelajak },
    });
    await new UebungService(prisma as any).pruefen(
      {
        itemType: 'WORT',
        itemId: 1,
        format: 'PAAR',
        given: 'hallo=salom|danke=rahmat|ich=men|du=sen',
      },
      ctx,
    );
    const call = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0];
    expect(call.data.points).toBe(20);
  });
});

describe('pruefen — ZUORDNEN', () => {
  const ctx = { studentId: 55, companyId: 1 };

  function fakeMitPhrasen() {
    const prisma = fakePrisma();
    prisma.dafPhrase.findMany = jest.fn(async () => [
      { id: 1, funktionUz: 'salomlashish', de: 'Hallo!', uz: 'Salom!' },
      {
        id: 2,
        funktionUz: "o'zini tanishtirish",
        de: 'Ich bin Anna.',
        uz: 'Men Annaman.',
      },
    ]) as any;
    prisma.dafPhrase.findUnique = jest.fn(async () => ({
      de: 'Hallo!',
      uz: 'Salom!',
    })) as any;
    return prisma;
  }

  it('oltita juft kelmasa BUTUNLAY xato', async () => {
    // Xuddi PAAR kabi: juft soni noto'g'ri bo'lsa javob shakli buzilgan.
    const prisma = fakeMitPhrasen();
    const r = await new UebungService(prisma as any).pruefen(
      {
        itemType: 'PHRASE',
        itemId: 1,
        format: 'ZUORDNEN',
        given: 'salomlashish=Hallo!',
      },
      ctx,
    );
    expect(r.isCorrect).toBe(false);
  });

  it('ZUORDNEN ball BERMAYDI — ibora Leitnerga kirmaydi', async () => {
    const prisma = fakeMitPhrasen();
    await new UebungService(prisma as any).pruefen(
      {
        itemType: 'PHRASE',
        itemId: 1,
        format: 'ZUORDNEN',
        given: 'salomlashish=Hallo!',
      },
      ctx,
    );
    expect(
      (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0].data.points,
    ).toBe(0);
  });
});
