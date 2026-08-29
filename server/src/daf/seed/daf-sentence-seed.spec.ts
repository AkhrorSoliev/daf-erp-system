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
    findFirst: () => Promise.resolve(this.sentences[0] ?? null),
    count: () => Promise.resolve(this.sentences.length),
    updateMany: (args: { data: Partial<SentenceRow> }) => {
      for (const row of this.sentences) Object.assign(row, args.data);
      return Promise.resolve({ count: this.sentences.length });
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
});
