import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { DafSeedService, lexemeSourceId, toDafLevel } from './daf-seed.service';
import type { DafDataset } from '../../daf-content/dataset.types';

function dataset(): DafDataset {
  return {
    source: 'DIB',
    harvestedAt: '2026-08-27T00:00:00.000Z',
    license: 'CC BY 4.0',
    attribution: 'COERLL',
    chapters: [
      {
        chapter: 1,
        grammarFocus: ['no_02'],
        grammarRecommended: [],
        level: 'A1.1',
      },
    ],
    sections: [
      {
        id: 'dib-voc-01-01',
        chapter: 1,
        titleDe: 'Begrüßungen',
        titleEn: 'Greetings',
        audio: {
          sourceUrl: 'https://x/a.mp3',
          key: 'dib/audio/a.mp3',
          kind: 'AUDIO',
          license: 'CC BY 4.0',
          attribution: 'COERLL',
        },
        entries: [
          { de: 'Hallo!', en: 'Hello!', sectionId: 'dib-voc-01-01' },
          { de: 'Guten Tag!', en: 'Good day.', sectionId: 'dib-voc-01-01' },
        ],
      },
    ],
    transcripts: [],
    videos: [],
    grammar: [
      {
        code: 'no_02',
        titleDe: 'Genus',
        titleEn: 'noun gender',
        level: 'A1.1',
        explanation: 'German nouns have a gender.',
        dialogue: [],
        audio: [],
        exercises: [
          {
            id: 'no_02_01_fib_1',
            kind: 'GAP',
            sentenceDe: '___ Mutter gibt Rotkäppchen Kuchen.',
            blankCount: 1,
            answers: ['die'],
            answerStatus: 'FROM_SOURCE',
            grammarCode: 'no_02',
            setCode: 'no_02_01_fib',
            slots: [1],
          },
        ],
      },
    ],
    phonetics: [],
    documents: [],
  };
}

describe('DafSeedService', () => {
  let service: DafSeedService;
  let prisma: {
    dafUnit: { upsert: jest.Mock };
    dafLexeme: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      updateMany: jest.Mock;
    };
    dafGrammar: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    dafLesson: { upsert: jest.Mock; updateMany: jest.Mock };
    dafExercise: { upsert: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      dafUnit: { upsert: jest.fn().mockResolvedValue({ id: 10 }) },
      dafLexeme: {
        upsert: jest.fn().mockResolvedValue({ id: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      dafGrammar: {
        upsert: jest.fn().mockResolvedValue({ id: 20 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{ id: 20, unitId: 10 }]),
        findUnique: jest.fn().mockResolvedValue({ unitId: 10 }),
      },
      dafLesson: {
        upsert: jest.fn().mockResolvedValue({ id: 40 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      dafExercise: {
        upsert: jest.fn().mockResolvedValue({ id: 30 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // Yozuvlar bo'laklab tranzaksiyada yuboriladi; mock ularni shunchaki
      // kutadi.
      $transaction: jest
        .fn()
        .mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const module = await Test.createTestingModule({
      providers: [DafSeedService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(DafSeedService);
  });

  it('bo`lim, lug`at, grammatika va mashqlarni yozadi', async () => {
    const report = await service.seed(dataset());

    expect(report).toMatchObject({
      units: 1,
      // Bitta lug'at bo'limi + bitta grammatika sahifasi = ikkita dars.
      lessons: 2,
      lexemes: 2,
      grammar: 1,
      exercises: 1,
    });
  });

  // Idempotentlik `upsert` ning O'ZIDA: hamma narsa `sourceId` bo'yicha
  // yoziladi. Agar biror joyda `create` ishlatilsa, qayta yuritish
  // qatorni takrorlab, mashqni o'quvchiga ikki marta ko'rsatardi.
  it.each([
    ['dafLexeme', 'sourceId'],
    ['dafGrammar', 'sourceId'],
    ['dafExercise', 'sourceId'],
  ])('%s barqaror kalit (%s) bo`yicha upsert qilinadi', async (model, key) => {
    await service.seed(dataset());
    const call = (prisma as never as Record<string, { upsert: jest.Mock }>)[
      model
    ].upsert.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(Object.keys(call.where)).toEqual([key]);
  });

  // Manbadan yo'qolgan mashq O'CHIRILMAYDI: unga ishora qiluvchi urinish
  // tarixi ma'nosini yo'qotadi.
  it('manbada yo`q mashqni belgilaydi, o`chirmaydi', async () => {
    prisma.dafExercise.updateMany.mockResolvedValue({ count: 3 });

    const report = await service.seed(dataset());

    expect(report.retired).toBe(3);
    const where = prisma.dafExercise.updateMany.mock.calls[0][0] as {
      where: { sourceId: { notIn: string[] }; retiredAt: null };
      data: { retiredAt: Date };
    };
    expect(where.where.sourceId.notIn).toContain('no_02_01_fib_1');
    expect(where.data.retiredAt).toBeInstanceOf(Date);
  });

  // Nafaqadagi mashq manbada qaytadan paydo bo'lsa, u qaytariladi. Aks
  // holda bir marta yo'qolgan mashq abadiy ko'rinmay qolardi.
  it('qaytib kelgan mashqni nafaqadan chiqaradi', async () => {
    await service.seed(dataset());
    const call = prisma.dafExercise.upsert.mock.calls[0][0] as {
      update: { retiredAt: Date | null };
    };
    expect(call.update.retiredAt).toBeNull();
  });

  // Darajasiz bob bo'lim bo'la olmaydi: yo'l darajaga qurilgan, va
  // darajasiz bo'limni qayerga qo'yishni hech kim ayta olmaydi.
  it('darajasi hisoblanmagan bobni bo`lim qilmaydi', async () => {
    const d = dataset();
    delete d.chapters[0].level;

    const report = await service.seed(d);

    expect(report.units).toBe(0);
    expect(prisma.dafUnit.upsert).not.toHaveBeenCalled();
  });

  // `MISSING` bazaga tushmaydi: bu yig'ish oralig'idagi holat, saqlanadigan
  // fakt emas. Bazada javobsizlikning yagona nomi — `OPEN`.
  it('MISSING holatini OPEN sifatida yozadi', async () => {
    const d = dataset();
    d.grammar[0].exercises[0].answerStatus = 'MISSING';
    d.grammar[0].exercises[0].answers = null;

    await service.seed(d);

    const call = prisma.dafExercise.upsert.mock.calls[0][0] as {
      create: { answerStatus: string };
    };
    expect(call.create.answerStatus).toBe('OPEN');
  });

  // Tartib ATAYLAB shunday: avval lug'at darslari, keyin grammatika.
  // So'zsiz grammatika ma'nosiz — o'quvchi qoidani biladi, lekin uni
  // qo'llaydigan so'zi yo'q.
  it("lug'at darslarini grammatikadan oldin qo'yadi", async () => {
    await service.seed(dataset());

    const kinds = prisma.dafLesson.upsert.mock.calls.map(
      (c) => (c[0] as { create: { kind: string; order: number } }).create,
    );
    expect(kinds.map((k) => k.kind)).toEqual(['VOCAB', 'GRAMMAR']);
    expect(kinds.map((k) => k.order)).toEqual([1, 2]);
  });

  // Dars kaliti manbanikidan quriladi, shuning uchun qayta yuritish
  // darslarni takrorlamaydi.
  it("dars kalitini manba id'sidan quradi", async () => {
    await service.seed(dataset());

    const ids = prisma.dafLesson.upsert.mock.calls.map(
      (c) => (c[0] as { where: { sourceId: string } }).where.sourceId,
    );
    expect(ids).toEqual(['dib-voc-01-01', 'gram:no_02']);
  });

  it('audio kalitini leksemaga biriktiradi', async () => {
    await service.seed(dataset());
    const call = prisma.dafLexeme.upsert.mock.calls[0][0] as {
      create: { audioKey: string };
    };
    expect(call.create.audioKey).toBe('dib/audio/a.mp3');
  });

  // Tarjima fayldan qo'yiladi, shuning uchun ishlab chiqarishda model
  // umuman chaqirilmaydi va har muhitda aynan bir xil matn turadi.
  it('tarjimani fayldan qo`yadi', async () => {
    await service.seed(dataset(), {
      lexemes: [
        {
          sourceId: 'dib-voc-01-01#1',
          uz: 'Salom!',
          translationSource: 'MODEL',
        },
      ],
      grammar: [],
      lessons: [],
    });

    const call = prisma.dafLexeme.updateMany.mock.calls[0][0] as {
      where: { sourceId: string; translationSource: { not: string } };
      data: { uz: string };
    };
    expect(call.data.uz).toBe('Salom!');
  });

  // O'qituvchi tuzatgan tarjima qayta yozilmaydi: faylda modelning eski
  // tarjimasi turishi mumkin, va u tuzatishni jimgina bosib o'tardi.
  it('o`qituvchi tuzatgan tarjimani chetlab o`tadi', async () => {
    await service.seed(dataset(), {
      lexemes: [
        {
          sourceId: 'dib-voc-01-01#1',
          uz: 'Salom!',
          translationSource: 'MODEL',
        },
      ],
      grammar: [],
      lessons: [],
    });

    const call = prisma.dafLexeme.updateMany.mock.calls[0][0] as {
      where: { OR: { translationSource: unknown }[] };
    };
    expect(call.where.OR).toContainEqual({
      translationSource: { not: 'TEACHER' },
    });
  });

  // Tarjima fayli bo'lmasligi mumkin — birinchi yig'ishdan keyin, tarjima
  // hali yuritilmaganda. Bu xato emas.
  it('tarjima fayli bo`lmasa ham ishlaydi', async () => {
    const report = await service.seed(dataset());
    expect(report.translationsApplied).toBe(0);
    expect(prisma.dafLexeme.updateMany).not.toHaveBeenCalled();
  });
});

describe('toDafLevel', () => {
  // Prisma enum'ida nuqta bo'lolmaydi, manbada esa daraja `A1.1` shaklida.
  it.each([
    ['A1.1', 'A1_1'],
    ['A2.2', 'A2_2'],
    ['B1', 'B1'],
  ])('%s → %s', (input, expected) => {
    expect(toDafLevel(input as 'A1.1')).toBe(expected);
  });
});

describe('lexemeSourceId', () => {
  // Manbada leksemaning o'z id'si yo'q. Kalit bo'lim id'si va tartibdan
  // quriladi — ikki xil bo'limdagi bir xil so'z to'qnashmasligi uchun
  // bo'lim id'si kalitning bir qismi bo'lishi shart.
  it('bo`lim id`si va tartibdan quriladi', () => {
    expect(lexemeSourceId('dib-voc-01-01', 0)).toBe('dib-voc-01-01#1');
    expect(lexemeSourceId('dib-voc-02-03', 4)).toBe('dib-voc-02-03#5');
  });
});
