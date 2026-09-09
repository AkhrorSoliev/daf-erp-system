import { DafMediaCoverageService } from './daf-media-coverage.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * `$queryRaw` chaqiruvlarini tartib bo'yicha emas, SQL matni ichidagi jadval
 * nomi bo'yicha ajratamiz — Promise.all ichidagi chaqiruv tartibi o'zgarsa
 * ham test buzilmaydi (xuddi lesson-billing.service.spec.ts'dagi pattern).
 */
function buildPrismaMock(opts: {
  units?: unknown[];
  sections?: unknown[];
  wordRows?: unknown[];
  sentenceRows?: unknown[];
  phraseRows?: unknown[];
  dialogLineRows?: unknown[];
}) {
  const {
    units = [],
    sections = [],
    wordRows = [],
    sentenceRows = [],
    phraseRows = [],
    dialogLineRows = [],
  } = opts;

  return {
    dafUnit: { findMany: jest.fn().mockResolvedValue(units) },
    dafSection: { findMany: jest.fn().mockResolvedValue(sections) },
    $queryRaw: jest.fn().mockImplementation((strings: TemplateStringsArray) => {
      const sql = Array.isArray(strings) ? strings.join(' ') : String(strings);
      if (sql.includes('"DafLexeme"')) return Promise.resolve(wordRows);
      if (sql.includes('"DafSentence"')) return Promise.resolve(sentenceRows);
      if (sql.includes('"DafPhrase"')) return Promise.resolve(phraseRows);
      if (sql.includes('"DafDialogLine"'))
        return Promise.resolve(dialogLineRows);
      throw new Error(`Kutilmagan $queryRaw: ${sql}`);
    }),
  } as unknown as PrismaService;
}

describe('DafMediaCoverageService', () => {
  it('har unit va bo‘limni — bo‘sh bo‘lsa ham — ro‘yxatga qo‘shadi', async () => {
    const prisma = buildPrismaMock({
      units: [
        { id: 1, level: 'A1', order: 1, code: 'u01', titleUz: 'Tanishuv' },
        { id: 2, level: 'A1', order: 2, code: 'u02', titleUz: 'Oila' },
      ],
      sections: [
        {
          id: 10,
          unitId: 1,
          order: 1,
          code: 'u01-s1',
          titleUz: 'Salomlashish',
        },
      ],
    });
    const service = new DafMediaCoverageService(prisma);

    const { levels } = await service.coverage();
    expect(levels).toHaveLength(1);
    expect(levels[0].level).toBe('A1');
    expect(levels[0].units.map((u) => u.unitId)).toEqual([1, 2]);

    // Unit 2 — hech qanday bo'limi yo'q, lekin baribir ro'yxatda bor.
    expect(levels[0].units[1].sections).toEqual([]);

    // Unit 1ning yagona bo'limi — material yo'q, hammasi nol.
    const section = levels[0].units[0].sections[0];
    expect(section.sectionId).toBe(10);
    expect(section.words).toEqual({
      total: 0,
      withAudio: 0,
      pictureEligible: 0,
      withImage: 0,
    });
    expect(section.sentences).toEqual({ total: 0, withAudio: 0 });
    expect(section.phrases).toEqual({ total: 0, withAudio: 0 });
    expect(section.dialogLines).toEqual({ total: 0, withAudio: 0 });
  });

  it('unit va bo‘limlarni `order` ustuni bo‘yicha saralaydi, id bo‘yicha emas', async () => {
    // Prisma `orderBy` DBda saralaydi — bu yerda mock allaqachon TESKARI id
    // tartibida, lekin `order`ga to'g'ri saralangan holda qaytadi. Xizmat
    // qaytadan saralamasligi kerak — nimani olsa, shuni ko'rsatadi.
    const prisma = buildPrismaMock({
      units: [
        { id: 5, level: 'A1', order: 1, code: 'u01', titleUz: 'Birinchi' },
        { id: 2, level: 'A1', order: 2, code: 'u02', titleUz: 'Ikkinchi' },
      ],
      sections: [
        {
          id: 20,
          unitId: 5,
          order: 1,
          code: 'u01-s1',
          titleUz: 'Birinchi bo‘lim',
        },
      ],
    });
    const service = new DafMediaCoverageService(prisma);
    const { levels } = await service.coverage();
    expect(levels[0].units.map((u) => u.unitId)).toEqual([5, 2]);
  });

  it('so‘z hisobini audio va rasm bo‘yicha alohida qaytaradi', async () => {
    const prisma = buildPrismaMock({
      units: [
        { id: 1, level: 'A1', order: 1, code: 'u01', titleUz: 'Tanishuv' },
      ],
      sections: [
        { id: 10, unitId: 1, order: 1, code: 'u01-s1', titleUz: 'Salom' },
      ],
      wordRows: [
        {
          sectionId: 10,
          total: 53n,
          withAudio: 53n,
          pictureEligible: 30n,
          withImage: 0n,
        },
      ],
    });
    const service = new DafMediaCoverageService(prisma);
    const { levels } = await service.coverage();
    expect(levels[0].units[0].sections[0].words).toEqual({
      total: 53,
      withAudio: 53,
      pictureEligible: 30,
      withImage: 0,
    });
  });

  it('rasm chizib bo‘lmaydigan so‘z rasmsiz bo‘lsa ham kamchilik sifatida sanalmaydi', async () => {
    // 20 ta so'zdan faqat 8 tasi rasmga yaroqli (pictureEligible) — qolgan 12
    // tasi (masalan `weil`, `Verantwortung`) hech qachon rasm talab qilmaydi.
    // Nisbat pictureEligible/withImage ustida hisoblanishi kerak, total emas.
    const prisma = buildPrismaMock({
      units: [
        { id: 1, level: 'A1', order: 1, code: 'u01', titleUz: 'Tanishuv' },
      ],
      sections: [
        { id: 10, unitId: 1, order: 1, code: 'u01-s1', titleUz: 'Salom' },
      ],
      wordRows: [
        {
          sectionId: 10,
          total: 20n,
          withAudio: 20n,
          pictureEligible: 8n,
          withImage: 8n,
        },
      ],
    });
    const service = new DafMediaCoverageService(prisma);
    const { levels } = await service.coverage();
    const words = levels[0].units[0].sections[0].words;
    // Barcha rasmga yaroqli so'zlar rasmga ega — pictureEligible === withImage,
    // total bilan solishtirilsa (20 vs 8) "12 tasi yetishmayapti" deb noto'g'ri
    // o'qilardi.
    expect(words.pictureEligible).toBe(words.withImage);
    expect(words.total).toBeGreaterThan(words.pictureEligible);
  });

  it('gap, ibora va dialog qatorini faqat audio bo‘yicha hisoblaydi', async () => {
    const prisma = buildPrismaMock({
      units: [
        { id: 1, level: 'A1', order: 1, code: 'u01', titleUz: 'Tanishuv' },
      ],
      sections: [
        { id: 10, unitId: 1, order: 1, code: 'u01-s1', titleUz: 'Salom' },
      ],
      sentenceRows: [{ sectionId: 10, total: 37n, withAudio: 0n }],
      phraseRows: [{ sectionId: 10, total: 18n, withAudio: 5n }],
      dialogLineRows: [{ sectionId: 10, total: 40n, withAudio: 0n }],
    });
    const service = new DafMediaCoverageService(prisma);
    const { levels } = await service.coverage();
    const section = levels[0].units[0].sections[0];
    expect(section.sentences).toEqual({ total: 37, withAudio: 0 });
    expect(section.phrases).toEqual({ total: 18, withAudio: 5 });
    expect(section.dialogLines).toEqual({ total: 40, withAudio: 0 });
  });

  it('bir nechta darajani alohida guruhlaydi', async () => {
    const prisma = buildPrismaMock({
      units: [
        { id: 1, level: 'A1', order: 1, code: 'u01', titleUz: 'A1 uniti' },
        { id: 2, level: 'A2', order: 1, code: null, titleUz: 'A2 uniti' },
      ],
      sections: [],
    });
    const service = new DafMediaCoverageService(prisma);
    const { levels } = await service.coverage();
    expect(levels.map((l) => l.level).sort()).toEqual(['A1', 'A2']);
  });

  it('sectionId `null` bo‘lgan qatorlarni (eski DiB kontenti) hech qaysi bo‘limga qo‘shmaydi', async () => {
    const prisma = buildPrismaMock({
      units: [
        { id: 1, level: 'A1', order: 1, code: 'u01', titleUz: 'Tanishuv' },
      ],
      sections: [
        { id: 10, unitId: 1, order: 1, code: 'u01-s1', titleUz: 'Salom' },
      ],
      wordRows: [
        {
          sectionId: null,
          total: 999n,
          withAudio: 999n,
          pictureEligible: 0n,
          withImage: 0n,
        },
      ],
    });
    const service = new DafMediaCoverageService(prisma);
    const { levels } = await service.coverage();
    // sectionId=null qator hech qanday sectiondagi so'z sonini shishirmaydi.
    expect(levels[0].units[0].sections[0].words.total).toBe(0);
  });
});
