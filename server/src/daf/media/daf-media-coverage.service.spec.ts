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

  it('unit va bo‘limlarni bazadan `order` ustuni bo‘yicha SO‘RAYDI, id bo‘yicha emas', async () => {
    // Oldingi versiya mockning allaqachon to'g'ri saralab qaytargan
    // ma'lumotini qayta ko'rsatib, xizmat o'zi hech narsa saralamasa ham
    // (ya'ni servisdan `orderBy` butunlay o'chirilsa ham) YASHIL qolardi —
    // chunki mock kirish tartibini o'zgartirmaydi. Haqiqiy himoya —
    // Prisma'ga qaysi `orderBy` yuborilgani, DBning o'zi emas.
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
    await service.coverage();

    expect(prisma.dafUnit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ level: 'asc' }, { order: 'asc' }],
      }),
    );
    expect(prisma.dafSection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ unitId: 'asc' }, { order: 'asc' }],
      }),
    );
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

  it('so‘z hisobining to‘rtta ustunini (total/withAudio/pictureEligible/withImage) bir-biriga aralashtirmay ko‘chiradi', async () => {
    // Oldingi versiya faqat "8n === 8n" va "20 > 8" ni tekshirardi — bular
    // FIXTURE'NING O'ZIGA xos xossalar, xizmat kodiga emas: har qanday
    // pass-through (hatto ustunlarni aralashtirib qo'ygan) implementatsiya
    // ham shu ikkalasini qanoatlantiradi. To'rtta sonni ATAYLAB har xil
    // qilib qo'yamiz — shunda `pictureEligible` o'rniga `total`, yoki
    // `withImage` o'rniga `withAudio` kabi ustun almashinuvi (aynan
    // media-coverage-section.tsx'dagi haqiqiy xato — 3-topilmaga qarang)
    // aniq buziladi.
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
          withAudio: 15n,
          pictureEligible: 8n,
          withImage: 3n,
        },
      ],
    });
    const service = new DafMediaCoverageService(prisma);
    const { levels } = await service.coverage();
    const words = levels[0].units[0].sections[0].words;
    expect(words).toEqual({
      total: 20,
      withAudio: 15,
      pictureEligible: 8,
      withImage: 3,
    });
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

  it('sectionId `null` bo‘lgan qatorlarni (eski DiB kontenti) SQL darajasida chetlab o‘tadi', async () => {
    // Oldingi versiya faqat servisning ICHKI `continue` qatorini
    // (`if (r.sectionId === null) continue`) sinardi — lekin xarita
    // (`Map<number, ...>`) kalit sifatida `null`ni haqiqiy sectionId'lardan
    // (masalan 10) baribir ajratadi, shuning uchun o'sha qatorni OLIB
    // TASHLASH ham 999n sonini hech qaysi sectionga qo'shmasdi: test hech
    // narsani qo'riqlamasdi. Haqiqiy qo'riqchi — SQL'dagi
    // `WHERE "sectionId" IS NOT NULL`: shu bo'lmasa, sectionId=null qator
    // umuman $queryRaw natijasiga qaytmasdi. Shuni to'g'ridan-to'g'ri —
    // yuborilgan SQL matnidan — tekshiramiz, va yon-atrofda haqiqiy
    // bo'lim sonlari to'g'ri qolganini ham tasdiqlaymiz.
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
          total: 5n,
          withAudio: 5n,
          pictureEligible: 0n,
          withImage: 0n,
        },
      ],
    });
    const service = new DafMediaCoverageService(prisma);
    const { levels } = await service.coverage();

    // Haqiqiy bo'limning o'z soni buzilmagan.
    expect(levels[0].units[0].sections[0].words.total).toBe(5);

    const queryRawMock = prisma.$queryRaw as unknown as jest.Mock;
    const wordQueryCall = queryRawMock.mock.calls.find(([strings]) =>
      (Array.isArray(strings) ? strings.join(' ') : String(strings)).includes(
        '"DafLexeme"',
      ),
    );
    expect(wordQueryCall).toBeDefined();
    const [strings] = wordQueryCall as [TemplateStringsArray];
    const sql = strings.join(' ');
    expect(sql).toContain('"sectionId" IS NOT NULL');
  });
});
