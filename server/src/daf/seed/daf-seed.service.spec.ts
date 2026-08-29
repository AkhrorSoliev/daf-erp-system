import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DafSeedService,
  lessonSourceId,
  lexemeSourceId,
  toDafLevel,
} from './daf-seed.service';
import type { DafDataset } from '../../daf-content/dataset.types';
import type { A1UnitsFile } from '../units/a1-units.types';

const CONTENT = join(__dirname, '..', '..', '..', 'content', 'daf');

function readContent<T>(name: string): T {
  return JSON.parse(readFileSync(join(CONTENT, name), 'utf8')) as T;
}

/**
 * Bo'lim quruvchi testlar HAQIQIY ikki faylda ishlaydi.
 *
 * Sun'iy ma'lumot bu yerda yolg'on gapirardi: fayl 47 mavzuni da'vo qiladi
 * va seed aynan shuning to'liqligini qo'riqlaydi, ya'ni ikkita mavzuli
 * o'yinchoq dataset bilan tekshirganda tekshiruvning o'zi tekshirilmasdi.
 */
const realDataset = readContent<DafDataset>('dib.json');
const a1UnitsFile = readContent<A1UnitsFile>('a1-units.json');

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

// ───────────────────────────────────────────────────────────────────────
// Prisma o'rnini bosuvchi xotira ichidagi baza.
//
// Chaqiruv shaklini tekshiradigan oddiy mock bu taskning asosiy da'vosini
// IFODALAY OLMAYDI: «mashq grammatika orqali bo'limga yetib boradi» degan
// gap natijadagi qatorlar haqida, `upsert` ning argumenti haqida emas.
// Shuning uchun har usul `jest.fn()` bilan o'ralgan (eski testlar hamon
// `mock.calls` ni o'qiydi), lekin ichida haqiqiy yozadi va o'qiydi.
// ───────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown> & { id: number };
type Where = Record<string, unknown>;
type TableName =
  | 'dafUnit'
  | 'dafLesson'
  | 'dafLexeme'
  | 'dafGrammar'
  | 'dafExercise';

interface Link {
  table: TableName;
  fk: string;
}

/** `include: { lexemes: true }` — bolalar shu yerdan yig'iladi. */
const CHILDREN: Partial<Record<TableName, Record<string, Link>>> = {
  dafUnit: {
    lessons: { table: 'dafLesson', fk: 'unitId' },
    lexemes: { table: 'dafLexeme', fk: 'unitId' },
    grammar: { table: 'dafGrammar', fk: 'unitId' },
  },
};

/** `where: { grammar: { unit: { level } } }` — otalar shu yerdan. */
const PARENTS: Partial<Record<TableName, Record<string, Link>>> = {
  dafExercise: {
    grammar: { table: 'dafGrammar', fk: 'grammarId' },
    unit: { table: 'dafUnit', fk: 'unitId' },
    lesson: { table: 'dafLesson', fk: 'lessonId' },
  },
  dafGrammar: { unit: { table: 'dafUnit', fk: 'unitId' } },
  dafLesson: { unit: { table: 'dafUnit', fk: 'unitId' } },
  dafLexeme: { unit: { table: 'dafUnit', fk: 'unitId' } },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Prisma'ning filtr operatorlaridan kerakli to'rttasi. */
function matchValue(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (isPlainObject(cond)) {
    if ('in' in cond) return (cond.in as unknown[]).includes(value);
    if ('notIn' in cond) return !(cond.notIn as unknown[]).includes(value);
    if ('not' in cond) return value !== cond.not;
  }
  return value === cond;
}

class FakeDb {
  private seq = 0;
  private readonly rows: Record<TableName, Row[]> = {
    dafUnit: [],
    dafLesson: [],
    dafLexeme: [],
    dafGrammar: [],
    dafExercise: [],
  };

  all(table: TableName): Row[] {
    return this.rows[table];
  }

  /**
   * Qo'shma kalitni yoyadi: `{ level_order: { level, order } }` →
   * `{ level, order }`. Prisma buni indeks nomi bilan beradi, xotiradagi
   * baza esa oddiy maydonlar bo'yicha qidiradi.
   */
  private flatten(table: TableName, where: Where): Where {
    const out: Where = {};
    for (const [key, cond] of Object.entries(where)) {
      const isRelation = PARENTS[table]?.[key] !== undefined;
      if (!isRelation && key.includes('_') && isPlainObject(cond)) {
        Object.assign(out, cond);
        continue;
      }
      out[key] = cond;
    }
    return out;
  }

  private matches(table: TableName, row: Row, where: Where): boolean {
    for (const [key, cond] of Object.entries(where)) {
      if (key === 'OR') {
        const branches = cond as Where[];
        if (!branches.some((b) => this.matches(table, row, b))) return false;
        continue;
      }
      const link = PARENTS[table]?.[key];
      if (link && isPlainObject(cond)) {
        const fk = row[link.fk];
        const parent =
          typeof fk === 'number'
            ? this.rows[link.table].find((r) => r.id === fk)
            : undefined;
        if (!parent || !this.matches(link.table, parent, cond)) return false;
        continue;
      }
      if (!matchValue(row[key], cond)) return false;
    }
    return true;
  }

  private find(table: TableName, where: Where): Row | undefined {
    const flat = this.flatten(table, where);
    return this.rows[table].find((r) => this.matches(table, r, flat));
  }

  private project(table: TableName, row: Row, include?: Where): Row {
    const out: Row = { ...row };
    for (const [name, wanted] of Object.entries(include ?? {})) {
      const link = CHILDREN[table]?.[name];
      if (!link || wanted !== true) continue;
      out[name] = this.rows[link.table]
        .filter((r) => r[link.fk] === row.id)
        .map((r) => ({ ...r }));
    }
    return out;
  }

  upsert(
    table: TableName,
    args: { where: Where; create: Where; update: Where },
  ): Row {
    const existing = this.find(table, args.where);
    if (existing) {
      Object.assign(existing, args.update);
      return { ...existing };
    }
    const row: Row = { id: ++this.seq, ...args.create } as Row;
    this.rows[table].push(row);
    return { ...row };
  }

  findMany(table: TableName, args?: { where?: Where; include?: Where }): Row[] {
    const where = this.flatten(table, args?.where ?? {});
    return this.rows[table]
      .filter((r) => this.matches(table, r, where))
      .map((r) => this.project(table, r, args?.include));
  }

  findFirst(
    table: TableName,
    args?: { where?: Where; include?: Where },
  ): Row | null {
    return this.findMany(table, args)[0] ?? null;
  }

  findUnique(
    table: TableName,
    args: { where: Where; include?: Where },
  ): Row | null {
    const row = this.find(table, args.where);
    return row ? this.project(table, row, args.include) : null;
  }

  count(table: TableName, args?: { where?: Where }): number {
    return this.findMany(table, args).length;
  }

  updateMany(
    table: TableName,
    args: { where: Where; data: Where },
  ): { count: number } {
    const where = this.flatten(table, args.where);
    let count = 0;
    for (const row of this.rows[table]) {
      if (!this.matches(table, row, where)) continue;
      Object.assign(row, args.data);
      count++;
    }
    return { count };
  }

  deleteMany(table: TableName, args: { where: Where }): { count: number } {
    const where = this.flatten(table, args.where);
    const keep = this.rows[table].filter((r) => !this.matches(table, r, where));
    const count = this.rows[table].length - keep.length;
    this.rows[table] = keep;
    return { count };
  }
}

interface ReadArgs {
  where?: Where;
  include?: Where;
}

/**
 * Usullar TIPLANGAN: `jest.Mock` yolg'iz `any` qaytaradi va u testdagi
 * har bir o'qishni tekshiruvsiz qoldirardi — mock'ning yolg'on gapirishi
 * aynan shu joydan boshlanadi.
 */
interface FakeModel {
  upsert: jest.Mock<
    Promise<Row>,
    [{ where: Where; create: Where; update: Where }]
  >;
  findMany: jest.Mock<Promise<Row[]>, [ReadArgs?]>;
  findFirst: jest.Mock<Promise<Row | null>, [ReadArgs?]>;
  findUnique: jest.Mock<
    Promise<Row | null>,
    [{ where: Where; include?: Where }]
  >;
  count: jest.Mock<Promise<number>, [{ where?: Where }?]>;
  updateMany: jest.Mock<
    Promise<{ count: number }>,
    [{ where: Where; data: Where }]
  >;
  deleteMany: jest.Mock<Promise<{ count: number }>, [{ where: Where }]>;
}

function fakeModel(db: FakeDb, table: TableName): FakeModel {
  return {
    upsert: jest.fn((a: Parameters<FakeDb['upsert']>[1]) =>
      Promise.resolve(db.upsert(table, a)),
    ),
    findMany: jest.fn((a?: Parameters<FakeDb['findMany']>[1]) =>
      Promise.resolve(db.findMany(table, a)),
    ),
    findFirst: jest.fn((a?: Parameters<FakeDb['findFirst']>[1]) =>
      Promise.resolve(db.findFirst(table, a)),
    ),
    findUnique: jest.fn((a: Parameters<FakeDb['findUnique']>[1]) =>
      Promise.resolve(db.findUnique(table, a)),
    ),
    count: jest.fn((a?: Parameters<FakeDb['count']>[1]) =>
      Promise.resolve(db.count(table, a)),
    ),
    updateMany: jest.fn((a: Parameters<FakeDb['updateMany']>[1]) =>
      Promise.resolve(db.updateMany(table, a)),
    ),
    deleteMany: jest.fn((a: Parameters<FakeDb['deleteMany']>[1]) =>
      Promise.resolve(db.deleteMany(table, a)),
    ),
  };
}

describe('DafSeedService', () => {
  let service: DafSeedService;
  let db: FakeDb;
  let prisma: Record<TableName, FakeModel>;

  beforeEach(async () => {
    db = new FakeDb();
    prisma = {
      dafUnit: fakeModel(db, 'dafUnit'),
      dafLesson: fakeModel(db, 'dafLesson'),
      dafLexeme: fakeModel(db, 'dafLexeme'),
      dafGrammar: fakeModel(db, 'dafGrammar'),
      dafExercise: fakeModel(db, 'dafExercise'),
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
      // Bo'lim ichida aynan beshta bosqich — manbaning bo'linishi emas.
      lessons: 5,
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
    ['dafLesson', 'sourceId'],
  ])('%s barqaror kalit (%s) bo`yicha upsert qilinadi', async (model, key) => {
    await service.seed(dataset());
    const call = prisma[model as TableName].upsert.mock.calls[0][0];
    expect(Object.keys(call.where)).toEqual([key]);
  });

  // Manbadan yo'qolgan mashq O'CHIRILMAYDI: unga ishora qiluvchi urinish
  // tarixi ma'nosini yo'qotadi.
  it('manbada yo`q mashqni belgilaydi, o`chirmaydi', async () => {
    const d = dataset();
    // Bazada avvalgi seed'dan qolgan, endi manbada yo'q mashq.
    db.all('dafExercise').push({ id: 999, sourceId: 'eski_mashq' } as never);

    const report = await service.seed(d);

    expect(report.retired).toBe(1);
    const call = prisma.dafExercise.updateMany.mock.calls[0][0];
    const sourceId = call.where.sourceId as { notIn: string[] };
    expect(sourceId.notIn).toContain('no_02_01_fib_1');
    expect(call.data.retiredAt).toBeInstanceOf(Date);
  });

  // Nafaqadagi mashq manbada qaytadan paydo bo'lsa, u qaytariladi. Aks
  // holda bir marta yo'qolgan mashq abadiy ko'rinmay qolardi.
  it('qaytib kelgan mashqni nafaqadan chiqaradi', async () => {
    await service.seed(dataset());
    const call = prisma.dafExercise.upsert.mock.calls[0][0];
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

    const call = prisma.dafExercise.upsert.mock.calls[0][0];
    expect(call.create.answerStatus).toBe('OPEN');
  });

  // Bosqich dars TURI emas, qiyinlik pog'onasi. Shuning uchun bo'limda
  // manba nechta mavzu bergani muhim emas — hamisha beshta.
  it("bo'lim ichida aynan beshta bosqich yaratadi", async () => {
    await service.seed(dataset());

    const created = prisma.dafLesson.upsert.mock.calls.map((c) => c[0].create);
    expect(created.map((l) => l.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(created.map((l) => l.order)).toEqual([1, 2, 3, 4, 5]);
  });

  // Dars kaliti bo'lim va bosqichdan quriladi. Manbadan olinsa, bo'lim
  // chegarasi o'zgargan zahoti kalit ham o'zgarib, o'quvchining
  // `DafLessonProgress` tarixi darssiz qolardi.
  it("dars kalitini bo'lim va bosqichdan quradi", async () => {
    await service.seed(dataset());

    const ids = prisma.dafLesson.upsert.mock.calls.map(
      (c) => c[0].where.sourceId,
    );
    expect(ids).toEqual([
      'lesson_A1_1_t1',
      'lesson_A1_1_t2',
      'lesson_A1_1_t3',
      'lesson_A1_1_t4',
      'lesson_A1_1_t5',
    ]);
  });

  // So'z BO'LIMga tegishli, darsga emas: bosqich so'zlarni ish vaqtida,
  // o'quvchining holatiga qarab oladi.
  it('so`zni bosqichga qadamaydi', async () => {
    await service.seed(dataset());

    const call = prisma.dafLexeme.upsert.mock.calls[0][0];
    expect(call.create.lessonId).toBeNull();
    expect(call.update.lessonId).toBeNull();
  });

  it('audio kalitini leksemaga biriktiradi', async () => {
    await service.seed(dataset());
    const call = prisma.dafLexeme.upsert.mock.calls[0][0];
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

    const call = prisma.dafLexeme.updateMany.mock.calls[0][0];
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

    const call = prisma.dafLexeme.updateMany.mock.calls[0][0];
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

  describe('A1 bo`limlari fayldan quriladi', () => {
    // Fayl da'vo qilmagan bob eski yo'lda qoladi — aks holda A2/B1
    // seed'i shu o'zgarish bilan buzilardi.
    it('fayl da`vo qilmagan bob eski bob-bo`lim yo`lida qoladi', async () => {
      const report = await service.seed(realDataset, undefined, a1UnitsFile);

      const a2 = await prisma.dafUnit.findMany({ where: { level: 'A2' } });
      const b1 = await prisma.dafUnit.findMany({ where: { level: 'B1' } });
      expect(a2.length).toBeGreaterThan(0);
      expect(b1.length).toBeGreaterThan(0);
      expect(report.units).toBe(
        a1UnitsFile.units.length + a2.length + b1.length,
      );
    });

    // Daraja ichidagi tartib manbaning `A2.1`/`A2.2` yorlig'idan emas,
    // bazaning `A2` darajasidan sanaladi — aks holda ikki bob bitta
    // (daraja, tartib) juftini talashib, biri ikkinchisini bosib o'tardi.
    it('bir darajadagi bo`limlarga uzluksiz tartib beradi', async () => {
      await service.seed(realDataset, undefined, a1UnitsFile);

      const a2 = await prisma.dafUnit.findMany({ where: { level: 'A2' } });
      const orders = a2.map((u) => u.order as number);
      expect(orders.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
    });

    it('bir bo`limga bir necha mavzuning so`zlarini yig`adi', async () => {
      await service.seed(realDataset, undefined, a1UnitsFile);

      const unit = await prisma.dafUnit.findFirst({
        where: { level: 'A1', order: 1 },
        include: { lexemes: true },
      });
      expect(unit?.titleUz).toBe(a1UnitsFile.units[0].titleUz);
      expect((unit?.lexemes as unknown[]).length).toBeGreaterThanOrEqual(30);
    });

    // Har bo'limda aynan 5 bosqich — dars endi turi bilan emas,
    // darajasi bilan ajraladi.
    it('har A1 bo`limida aynan 5 bosqich yaratadi', async () => {
      await service.seed(realDataset, undefined, a1UnitsFile);

      const units = await prisma.dafUnit.findMany({
        where: { level: 'A1' },
        include: { lessons: true },
      });
      expect(units).toHaveLength(a1UnitsFile.units.length);
      for (const u of units) {
        const lessons = u.lessons as { tier: number }[];
        expect(lessons.map((l) => l.tier).sort()).toEqual([1, 2, 3, 4, 5]);
      }
    });

    // Tegmagan mavzu — jimgina yo'qolgan kontent. Seed buni kechirmaydi.
    it('tegmagan mavzu qolsa yiqiladi', async () => {
      const broken = {
        ...a1UnitsFile,
        units: [a1UnitsFile.units[0]],
      };
      await expect(
        service.seed(realDataset, undefined, broken),
      ).rejects.toThrow(/tegmagan mavzu/i);
    });

    // Faza 2 da mashqlarning 39 % iga bo'lim yo'lidan yetib bo'lmasdi.
    // Fayl grammatikani qo'lda biriktirgani uchun yetim sahifa ham
    // kerakli bo'limga ulanadi.
    it('fayl ko`rsatgan grammatikani bo`limga ulaydi', async () => {
      await service.seed(realDataset, undefined, a1UnitsFile);

      const first = a1UnitsFile.units[0];
      const unit = await prisma.dafUnit.findFirst({
        where: { level: 'A1', order: 1 },
        include: { grammar: true },
      });
      const grammar = unit?.grammar as { sourceId: string }[];
      expect(grammar.map((g) => g.sourceId).sort()).toEqual(
        [...first.grammar].sort(),
      );
    });

    // Mashq grammatika orqali bo'limga yetib borishi kerak, aks holda
    // u yana yetim qoladi.
    it('grammatikaning mashqlari ham o`sha bo`limga tushadi', async () => {
      await service.seed(realDataset, undefined, a1UnitsFile);

      const orphan = await prisma.dafExercise.count({
        where: { unitId: null, grammar: { unit: { level: 'A1' } } },
      });
      expect(orphan).toBe(0);
    });
  });
});

describe('toDafLevel', () => {
  // A1.1/A1.2 bo'linishi manbaning yorlig'i edi. O'quvchi va Goethe
  // imtihoni uchun daraja bitta.
  it.each([
    ['A1.1', 'A1'],
    ['A1.2', 'A1'],
    ['A2.1', 'A2'],
    ['A2.2', 'A2'],
    ['B1', 'B1'],
  ])('%s → %s', (input, expected) => {
    expect(toDafLevel(input as 'A1.1')).toBe(expected);
  });
});

describe('lessonSourceId', () => {
  // Kalit manbadan EMAS, bo'lim va bosqichdan quriladi: manba bo'linishi
  // o'zgarganda o'quvchining tarixi darssiz qolmasin.
  it('bo`lim va bosqichdan quriladi', () => {
    expect(lessonSourceId('A1', 3, 2)).toBe('lesson_A1_3_t2');
    expect(lessonSourceId('B1', 1, 5)).toBe('lesson_B1_1_t5');
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
