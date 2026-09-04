import { UebungService } from './uebung.service';

/**
 * Bazaning eng kichik soxta nusxasi. Prisma o'rniga: bizni servisning
 * mantig'i qiziqtiradi, Prisma emas.
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
    },
    {
      id: 2,
      de: 'danke',
      uz: 'rahmat',
      artikel: null,
      anzeige: null,
      core: true,
      sectionId: 7,
    },
    {
      id: 3,
      de: 'ich',
      uz: 'men',
      artikel: null,
      anzeige: null,
      core: true,
      sectionId: 7,
    },
    {
      id: 4,
      de: 'du',
      uz: 'sen',
      artikel: null,
      anzeige: null,
      core: true,
      sectionId: 7,
    },
    {
      id: 5,
      de: 'Name',
      uz: 'ism',
      artikel: 'der',
      anzeige: null,
      core: true,
      sectionId: 7,
    },
    {
      id: 6,
      de: 'Guten Abend',
      uz: 'xayrli kech',
      artikel: null,
      anzeige: null,
      core: false,
      sectionId: 7,
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
      findMany: jest.fn(async () => lexeme),
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
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 1, format: 'WORT_UZ', given: 'salom' },
      ctx,
    );
    expect(prisma.dafLexemeState.upsert).toHaveBeenCalled();
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

  it('LUECKE javobini hozircha tekshirmaydi — xato tashlaydi', async () => {
    const prisma = fakePrisma();
    await expect(
      new UebungService(prisma as any).pruefen(
        { itemType: 'SATZ', itemId: 11, format: 'LUECKE', given: 'bin' },
        ctx,
      ),
    ).rejects.toThrow();
  });
});
