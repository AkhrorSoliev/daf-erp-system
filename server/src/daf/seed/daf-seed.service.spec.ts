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
import type { SentenceFile } from './daf-sentence-seed';

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
// Haqiqiy `sentences.json`: A1 ning ESKI 20 bo'limlik tuzilishiga (order
// 1..20) qarab yasalgan — aynan shu fayl `npm run daf:seed` skriptidan
// `DafSeedService.seed()`ga uzatilardi.
const sentencesFile = readContent<SentenceFile>('sentences.json');

// `A2.1` ATAYLAB tanlangan, `A1.1` emas: bu sun'iy dataset A1 bilan hech
// qanday aloqasi yo'q umumiy seed xatti-harakatini (bo'lim, dars, lug'at,
// grammatika, mashq) sinaydi. A1 endi `seedUnits`da qasddan chetlab
// o'tiladi (qarang shu faylning pastidagi "A1 endi bu yerdan seed
// qilinmaydi" bo'limi), shuning uchun bu umumiy testlar A1dan boshqa
// darajada bo'lishi SHART — aks holda ular chetlab o'tilgan yo'lni emas,
// bo'sh natijani sinardi.
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
        level: 'A2.1',
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
        level: 'A2.1',
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
      'lesson_A2_1_t1',
      'lesson_A2_1_t2',
      'lesson_A2_1_t3',
      'lesson_A2_1_t4',
      'lesson_A2_1_t5',
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

  describe('A1 endi bu yerdan seed qilinmaydi', () => {
    // A1 xaritasi endi `npm run daf:a1-seed`ning yagona mulki. Eski
    // `a1-units.json`ni bu servisga uzatish A1 migratsiyasidan keyin
    // XATARLI: eski DiB A1 bo'limlari `order = -id`ga o'tkazilgan, shuning
    // uchun `level_order` bo'yicha upsert ularni ENDI topa olmaydi —
    // buning o'rniga YANGI 12 unitning (`u01`..`u12`) ustidan yozib, DiB
    // sarlavhasi bilan almashtirar, so'ng qolgan orderlarga yana 8 ta A1
    // unit qo'shib yuborardi.
    it('a1Units berilsa rad etadi', async () => {
      await expect(
        service.seed(dataset(), undefined, a1UnitsFile),
      ).rejects.toThrow(/daf:a1-seed/);
    });

    it('rad etish sababi tushunarli: A1 nafaqaga chiqarilgani aytiladi', async () => {
      await expect(
        service.seed(dataset(), undefined, a1UnitsFile),
      ).rejects.toThrow(/nafaqaga chiqarilgan/);
    });

    // `a1Units` uzatilmasa — `daf:seed` skripti endi shunday chaqiradi —
    // A2/B1 avvalgidek bob-bo'lim yo'lida ishlaydi. `daf:translate` va
    // `daf:gen-sentences` `daf:seed`ning qayta yuritilishiga tayanadi,
    // shuning uchun bu yo'l buzilmasligi shart.
    //
    // `realDataset` (`dib.json`) A1, A2 va B1 boblarini BIRGA o'z ichiga
    // oladi — bu muhim: A1 ni butunlay tashlab ketuvchi tekshiruv faqat
    // shu aralash faylda ma'noga ega. Avvalgi versiyasi `a1Units`ni hech
    // qachon uzatmagani uchun yangi kodni sinamas va A1 haqida hech narsa
    // da'vo qilmas edi — aynan shu sababli legacy yo'l A1 ning DiB
    // boblarini (1-4) `u01`..`u04` ustidan yozib yuborgani sezilmagan edi.
    it('a1Units berilmasa A1 tegilmaydi, A2/B1 avvalgidek quriladi', async () => {
      const report = await service.seed(realDataset);

      const a1 = await prisma.dafUnit.findMany({ where: { level: 'A1' } });
      const a2 = await prisma.dafUnit.findMany({ where: { level: 'A2' } });
      const b1 = await prisma.dafUnit.findMany({ where: { level: 'B1' } });

      // A1: bitta ham unit yozilmaydi — na yaratiladi, na yangilanadi.
      // `daf:a1-seed` migratsiyasidan keyin A1 boblarining ESKI order'i
      // (1..4) yangi qo'lda chizilgan `u01`..`u04` bilan bir xil bo'lib
      // qoladi, shuning uchun bu yo'q qatorli tekshiruv aynan o'sha
      // to'qnashuvni ushlaydi.
      expect(a1).toHaveLength(0);
      expect(
        prisma.dafUnit.upsert.mock.calls.some(
          (c) => (c[0].where.level_order as { level?: string })?.level === 'A1',
        ),
      ).toBe(false);

      // A1 uchun unit yo'q bo'lgani uchun unga bog'lanadigan dars ham yo'q.
      const a1LessonIds = prisma.dafLesson.upsert.mock.calls
        .map((c) => c[0].where.sourceId as string)
        .filter((id) => id.startsWith('lesson_A1_'));
      expect(a1LessonIds).toHaveLength(0);

      // So'z va mashq A1 unitga BOG'LANMAYDI (bog'lanadigan unit yo'q).
      const allUnits = db.all('dafUnit');
      const isA1Unit = (unitId: number | null | undefined) =>
        unitId != null && allUnits.find((u) => u.id === unitId)?.level === 'A1';
      const lexemes = await prisma.dafLexeme.findMany({});
      const exercises = await prisma.dafExercise.findMany({});
      expect(lexemes.some((l) => isA1Unit(l.unitId as number))).toBe(false);
      expect(exercises.some((e) => isA1Unit(e.unitId as number | null))).toBe(
        false,
      );

      // A2/B1 avvalgidek — bob-bo'lim yo'li o'zgarishsiz ishlaydi.
      expect(a2.length).toBeGreaterThan(0);
      expect(b1.length).toBeGreaterThan(0);
      expect(report.units).toBe(a2.length + b1.length);
      expect(report.lessons).toBe((a2.length + b1.length) * 5);
    });
  });

  describe('Gap fayli endi bu yerdan seed qilinmaydi', () => {
    // `sentences.json` A1 ning ESKI 20 bo'limlik tuzilishiga (order 1..20)
    // qarab yasalgan — `npm run daf:a1-seed` migratsiyasidan keyingi 12
    // unitga (order 1..12) emas. `npm run daf:seed` (`daf-seed.ts`) shu
    // faylni o'qib `DafSeedService.seed()`ga uzatishi mumkin edi: orderlar
    // 1..12 YANGI unitlarga to'g'ri kelib, ularga tegishli bo'lmagan 508 ta
    // gap yopishtirilardi, order 13 esa hech qanday bo'limga tushmay
    // `Bo'lim topilmadi: A1 #13` bilan butun seedni yiqitardi. Bu haqiqiy
    // faylni, aynan skript uzatgan shaklda, shu servisga berish — skript
    // bosib o'tadigan yo'lning o'zi, gipotetik emas.
    it('sentences berilsa rad etadi', async () => {
      await expect(
        service.seed(dataset(), undefined, undefined, sentencesFile),
      ).rejects.toThrow(/ESKI 20/);
    });

    it('rad etish sababi tushunarli: eski tuzilish aytiladi', async () => {
      await expect(
        service.seed(dataset(), undefined, undefined, sentencesFile),
      ).rejects.toThrow(/daf:a1-seed/);
    });

    // Rad etish DASTLABKI qadam — hech qanday bo'lim o'qilmaydi, hech
    // qanday gap yozilmaydi. `npm run daf:seed`ning kuzatiladigan natijasi
    // aynan shu: A1 bo'limi o'qilmaydi, `DafSentence` qatori yozilmaydi.
    it("bo'lim o'qishga yetmasdan rad etadi: hech qanday DafUnit so'rovi ketmaydi", async () => {
      const before = prisma.dafUnit.findFirst.mock.calls.length;

      await expect(
        service.seed(dataset(), undefined, undefined, sentencesFile),
      ).rejects.toThrow();

      expect(prisma.dafUnit.findFirst.mock.calls.length).toBe(before);
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
