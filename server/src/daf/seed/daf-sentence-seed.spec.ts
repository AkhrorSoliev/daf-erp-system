import type { PrismaService } from '../../prisma/prisma.service';
import {
  seedSentences,
  countWords,
  type SentenceFile,
} from './daf-sentence-seed';

// ───────────────────────────────────────────────────────────────────────
// Prisma o'rnini bosuvchi xotira ichidagi baza.
//
// `daf-seed.service.spec.ts` dagi to'liq `FakeDb` bu yerga ortiqcha:
// u yerda o'nlab jadval va bog'lanish bor, bu yerda ikkitagina jadval
// (`dafUnit`, `dafSentence`) va ular orasida bitta tashqi kalit.
// ───────────────────────────────────────────────────────────────────────

interface UnitRow {
  id: number;
  level: string;
  order: number;
}

interface SentenceRow {
  id: number;
  unitId: number;
  order: number;
  de: string;
  uz: string;
  wordCount: number;
  origin: string;
  audioKey: string | null;
}

type WhereClause = Record<string, unknown>;

/**
 * `where` shartini bitta qatorga qo'llaydi.
 *
 * Ko'rik ogohlantirgan zaiflik shu yerda edi: avvalgi soxta `findFirst`
 * argumentini butunlay e'tiborsiz qoldirib doim `sentences[0]`ni
 * qaytarardi, `count` esa `where`ni bilmasdi. Ikki qatorli test (bir
 * bo'limda ikki gap) shu holda noto'g'ri qatorni ham «to'g'ri» deb
 * tasdiqlashi mumkin edi. Bu funksiya `unitId_order`, oddiy tenglik va
 * `{ in: [...] }` operatorini haqiqiy Prisma singari qo'llab, testni
 * o'zi tekshirayotgan naqshga ishonchli qiladi.
 */
function matchesWhere(row: SentenceRow, where?: WhereClause): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'unitId_order') {
      const c = cond as { unitId: number; order: number };
      if (row.unitId !== c.unitId || row.order !== c.order) return false;
      continue;
    }
    if (cond && typeof cond === 'object' && 'in' in cond) {
      const list = (cond as { in: unknown[] }).in;
      if (!list.includes(row[key as keyof SentenceRow])) return false;
      continue;
    }
    if (row[key as keyof SentenceRow] !== cond) return false;
  }
  return true;
}

class FakePrisma {
  private unitSeq = 0;
  private sentenceSeq = 0;
  private readonly units: UnitRow[] = [];
  private readonly sentences: SentenceRow[] = [];

  /** Testga bo'lim qo'shadi — bo'limsiz gap yozib bo'lmaydi. */
  addUnit(level: string, order: number): UnitRow {
    const row: UnitRow = { id: ++this.unitSeq, level, order };
    this.units.push(row);
    return row;
  }

  readonly dafUnit = {
    findFirst: (args: { where: { level: string; order: number } }) =>
      Promise.resolve(
        this.units.find(
          (u) => u.level === args.where.level && u.order === args.where.order,
        ) ?? null,
      ),
  };

  readonly dafSentence = {
    upsert: (args: {
      where: { unitId_order: { unitId: number; order: number } };
      create: Omit<SentenceRow, 'id' | 'audioKey'>;
      update: Partial<SentenceRow>;
    }) => {
      const { unitId, order } = args.where.unitId_order;
      const existing = this.sentences.find(
        (s) => s.unitId === unitId && s.order === order,
      );
      if (existing) {
        Object.assign(existing, args.update);
        return Promise.resolve({ ...existing });
      }
      const row: SentenceRow = {
        id: ++this.sentenceSeq,
        audioKey: null,
        ...args.create,
      };
      this.sentences.push(row);
      return Promise.resolve({ ...row });
    },
    findFirst: (args?: { where?: WhereClause }) =>
      Promise.resolve(
        this.sentences.find((s) => matchesWhere(s, args?.where)) ?? null,
      ),
    findMany: (args?: { where?: WhereClause }) =>
      Promise.resolve(
        this.sentences.filter((s) => matchesWhere(s, args?.where)),
      ),
    count: (args?: { where?: WhereClause }) =>
      Promise.resolve(
        this.sentences.filter((s) => matchesWhere(s, args?.where)).length,
      ),
    updateMany: (args: { where?: WhereClause; data: Partial<SentenceRow> }) => {
      const affected = this.sentences.filter((s) =>
        matchesWhere(s, args.where),
      );
      for (const row of affected) Object.assign(row, args.data);
      return Promise.resolve({ count: affected.length });
    },
    deleteMany: (args: { where?: WhereClause }) => {
      const toDelete = this.sentences.filter((s) =>
        matchesWhere(s, args.where),
      );
      const ids = new Set(toDelete.map((s) => s.id));
      for (let i = this.sentences.length - 1; i >= 0; i--) {
        if (ids.has(this.sentences[i].id)) this.sentences.splice(i, 1);
      }
      return Promise.resolve({ count: toDelete.length });
    },
  };
}

let fake: FakePrisma;
let prisma: PrismaService;

beforeEach(() => {
  fake = new FakePrisma();
  fake.addUnit('A1', 1);
  prisma = fake as unknown as PrismaService;
});

describe('countWords', () => {
  it('gapdagi so`zlarni sanaydi', () => {
    expect(countWords('Ich heiße Anna.')).toBe(3);
  });
  it('tinish belgisini so`z deb sanamaydi', () => {
    expect(countWords('Hallo! Wie geht es dir?')).toBe(5);
  });
});

describe('seedSentences', () => {
  it('bo`limga gaplarni yozadi va sonini qaytaradi', async () => {
    const n = await seedSentences(prisma, {
      generatedAt: 'x',
      model: 'm',
      units: [
        {
          order: 1,
          sentences: [
            {
              de: 'Ich heiße Anna.',
              uz: 'Mening ismim Anna.',
              origin: 'GENERATED',
            },
          ],
        },
      ],
    });
    expect(n).toBe(1);

    const row = await prisma.dafSentence.findFirst();
    expect(row).toMatchObject({
      de: 'Ich heiße Anna.',
      wordCount: 3,
      origin: 'GENERATED',
    });
  });

  // Manbadan olingan gap «yasama» bo'lib qolsa kelib chiqishi
  // yo'qoladi va ustoz ko'rigida qaysi biri model yozgani bilinmaydi.
  it('SOURCE gapni GENERATED qilib yozmaydi', async () => {
    await seedSentences(prisma, {
      generatedAt: 'x',
      model: 'm',
      units: [
        {
          order: 1,
          sentences: [
            { de: 'Wie heißt du?', uz: 'Ismingiz nima?', origin: 'SOURCE' },
          ],
        },
      ],
    });

    expect((await prisma.dafSentence.findFirst())?.origin).toBe('SOURCE');
  });

  // Qayta yugurish yangi qator yaratmasligi kerak, aks holda har
  // seed bazani ikkilantirardi.
  it('ikki marta yugursa qator ikkilanmaydi', async () => {
    const file: SentenceFile = {
      generatedAt: 'x',
      model: 'm',
      units: [
        { order: 1, sentences: [{ de: 'A.', uz: 'B.', origin: 'GENERATED' }] },
      ],
    };
    await seedSentences(prisma, file);
    await seedSentences(prisma, file);
    expect(await prisma.dafSentence.count()).toBe(1);
  });

  // Ovoz kaliti mashina o'lchovi, tarjima esa tahrir — biri
  // ikkinchisini bosib ketmasligi kerak.
  it('mavjud audioKey ni o`chirmaydi', async () => {
    const file: SentenceFile = {
      generatedAt: 'x',
      model: 'm',
      units: [
        { order: 1, sentences: [{ de: 'A.', uz: 'B.', origin: 'GENERATED' }] },
      ],
    };
    await seedSentences(prisma, file);
    await prisma.dafSentence.updateMany({ data: { audioKey: 'k.mp3' } });
    await seedSentences(prisma, file);
    expect((await prisma.dafSentence.findFirst())?.audioKey).toBe('k.mp3');
  });

  it('bo`lim topilmasa yiqiladi', async () => {
    await expect(
      seedSentences(prisma, {
        generatedAt: 'x',
        model: 'm',
        units: [
          {
            order: 99,
            sentences: [{ de: 'A.', uz: 'B.', origin: 'GENERATED' }],
          },
        ],
      }),
    ).rejects.toThrow(/99/);
  });

  // `origin` FAYLDAN o'qiladi, ya'ni runtime'da tekshirilmagan qiymat
  // kelishi mumkin: fayl qo'lda tahrirlansa yoki ertaga uchinchi qiymat
  // qo'shilsa, tip e'lon qilgan `DafSentenceOrigin` kompilyatsiya
  // vaqtidagi va'da, xolos — `JSON.parse` + `as SentenceFile` uni
  // tekshirmaydi. Shu yiqilish HAQIQIY chaqiruv yo'lidan (`seedSentences`
  // orqali) sinaladi, faqat `toSentenceOrigin`ni to'g'ridan-to'g'ri
  // chaqirib emas — aks holda qorovul chaqiruv joyida unutilsa ham test
  // yashil qolardi.
  it('noto`g`ri origin qiymatini aniq xabar bilan rad etadi', async () => {
    const bad = {
      generatedAt: 'x',
      model: 'm',
      units: [
        { order: 1, sentences: [{ de: 'A.', uz: 'B.', origin: 'YASAMA' }] },
      ],
    } as unknown as SentenceFile;

    await expect(seedSentences(prisma, bad)).rejects.toThrow(/YASAMA/);
  });

  // `update` blokidagi shartnoma haqiqiy chaqiruv yo'lidan sinaladi:
  // ikki yuritish orasida `de`/`uz` o'zgarsa, bazadagi qator YANGI
  // matnni ko'rsatishi shart — aks holda seed qayta yuritilgan bo'lsa
  // ham eski tarjima abadiy qolib ketardi.
  it('de/uz o`zgargan faylda qayta yuritish yangi matnni yozadi', async () => {
    const first: SentenceFile = {
      generatedAt: 'x',
      model: 'm',
      units: [
        {
          order: 1,
          sentences: [
            { de: 'Eski gap.', uz: 'Eski tarjima.', origin: 'GENERATED' },
          ],
        },
      ],
    };
    const second: SentenceFile = {
      generatedAt: 'y',
      model: 'm',
      units: [
        {
          order: 1,
          sentences: [
            { de: 'Yangi gap.', uz: 'Yangi tarjima.', origin: 'GENERATED' },
          ],
        },
      ],
    };
    await seedSentences(prisma, first);
    await seedSentences(prisma, second);

    expect(await prisma.dafSentence.count()).toBe(1);
    expect(await prisma.dafSentence.findFirst()).toMatchObject({
      de: 'Yangi gap.',
      uz: 'Yangi tarjima.',
    });
  });

  // KRITIK tuzatish: `origin` endi `update` blokida ham yoziladi.
  // Pozitsion kalit (`order`) tufayli bo'lim qisqarganda eski qator
  // boshqa gapga ishora qilib qolishi mumkin — `origin` yangilanmasa,
  // model yozgan gap mangu «manba» bo'lib qolib ketardi.
  it('origin o`zgargan faylda yangi qiymat yoziladi', async () => {
    const first: SentenceFile = {
      generatedAt: 'x',
      model: 'm',
      units: [
        { order: 1, sentences: [{ de: 'A.', uz: 'B.', origin: 'SOURCE' }] },
      ],
    };
    const second: SentenceFile = {
      generatedAt: 'y',
      model: 'm',
      units: [
        { order: 1, sentences: [{ de: 'A.', uz: 'B.', origin: 'GENERATED' }] },
      ],
    };
    await seedSentences(prisma, first);
    await seedSentences(prisma, second);

    expect((await prisma.dafSentence.findFirst())?.origin).toBe('GENERATED');
  });

  // MUHIM 2: gap matni yangilansa eski ovoz endi boshqa gapga tegishli
  // — bu «bosib o'tish» emas, bekor qilish. `audioKey` `null`ga
  // tushishi shart, TTS uni 9-taskda qayta yasaydi.
  it('de o`zgarganda audioKey null bo`ladi', async () => {
    const file: SentenceFile = {
      generatedAt: 'x',
      model: 'm',
      units: [
        {
          order: 1,
          sentences: [{ de: 'Eski gap.', uz: 'B.', origin: 'GENERATED' }],
        },
      ],
    };
    await seedSentences(prisma, file);
    await prisma.dafSentence.updateMany({ data: { audioKey: 'k.mp3' } });

    const changed: SentenceFile = {
      generatedAt: 'y',
      model: 'm',
      units: [
        {
          order: 1,
          sentences: [{ de: 'Yangi gap.', uz: 'B.', origin: 'GENERATED' }],
        },
      ],
    };
    await seedSentences(prisma, changed);

    expect((await prisma.dafSentence.findFirst())?.audioKey).toBeNull();
  });

  // MUHIM 2 ning ikkinchi yarmi: `de` o'zgarmasa `audioKey` TEGILMAYDI
  // — asl talab («seed ovozni bosib o'tmasin») kuchida qoladi.
  it('de o`zgarmaganda audioKey saqlanadi', async () => {
    const file: SentenceFile = {
      generatedAt: 'x',
      model: 'm',
      units: [
        { order: 1, sentences: [{ de: 'A.', uz: 'B.', origin: 'GENERATED' }] },
      ],
    };
    await seedSentences(prisma, file);
    await prisma.dafSentence.updateMany({ data: { audioKey: 'k.mp3' } });
    // `uz` o'zgardi, `de` o'zgarmadi — audioKey baribir saqlanishi kerak.
    const uzChanged: SentenceFile = {
      generatedAt: 'y',
      model: 'm',
      units: [
        {
          order: 1,
          sentences: [{ de: 'A.', uz: 'Yangi tarjima.', origin: 'GENERATED' }],
        },
      ],
    };
    await seedSentences(prisma, uzChanged);

    expect((await prisma.dafSentence.findFirst())?.audioKey).toBe('k.mp3');
    expect((await prisma.dafSentence.findFirst())?.uz).toBe('Yangi tarjima.');
  });

  // MUHIM 1: fayldan tushib qolgan gap bazada yetim qolmasligi kerak.
  // Bo'lim 2 gapdan 1 gapga tushganda eski 2-tartib qator o'chishi
  // shart — aks holda u qorovuldan o'tolmagan matnni saqlab, keyinchalik
  // mashqqa chiqishi mumkin bo'lib qolardi.
  it('faylda yo`q gap bazadan o`chiriladi', async () => {
    const twoSentences: SentenceFile = {
      generatedAt: 'x',
      model: 'm',
      units: [
        {
          order: 1,
          sentences: [
            { de: 'Birinchi.', uz: 'B1.', origin: 'GENERATED' },
            { de: 'Ikkinchi.', uz: 'B2.', origin: 'GENERATED' },
          ],
        },
      ],
    };
    await seedSentences(prisma, twoSentences);
    expect(await prisma.dafSentence.count()).toBe(2);

    const oneSentence: SentenceFile = {
      generatedAt: 'y',
      model: 'm',
      units: [
        {
          order: 1,
          sentences: [{ de: 'Birinchi.', uz: 'B1.', origin: 'GENERATED' }],
        },
      ],
    };
    const n = await seedSentences(prisma, oneSentence);

    expect(n).toBe(1);
    expect(await prisma.dafSentence.count()).toBe(1);
    expect((await prisma.dafSentence.findFirst())?.de).toBe('Birinchi.');
  });
});
