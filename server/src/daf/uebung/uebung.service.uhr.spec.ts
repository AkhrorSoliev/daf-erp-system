import { BadRequestException } from '@nestjs/common';
import { UebungService } from './uebung.service';

// The clock formats inside the engine: sessions, the replacement question
// and answer checking. Kept apart from `uebung.service.spec.ts`, which is
// far past the 500-line limit for new code.

const MEDIA = 'https://media.example.com';
const fakeConfig = { get: () => MEDIA } as any;

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

const WOERTER = ['Uhr', 'Zeit', 'Minute', 'Stunde', 'Morgen', 'Abend'].map(
  (de, i) => ({
    id: i + 1,
    de,
    uz: `u${i + 1}`,
    artikel: null,
    anzeige: null,
    core: true,
    sectionId: 51,
    unitId: 5,
    audioKey: null,
    imageKey: null,
    bildTippen: false,
  }),
);

const UHRZEITEN = [
  { id: 901, sectionId: 51, zeit: '03:30', audioKey: 'daf/audio/u1.mp3' },
  { id: 902, sectionId: 51, zeit: '07:15', audioKey: 'daf/audio/u2.mp3' },
  { id: 903, sectionId: 51, zeit: '09:45', audioKey: null },
  { id: 904, sectionId: 51, zeit: '12:00', audioKey: 'daf/audio/u4.mp3' },
];

function fakePrisma(kind: 'SECTION_A' | 'SECTION_B') {
  return {
    dafLesson: {
      findUnique: jest.fn(async () => ({
        id: 500,
        unitId: 5,
        sectionId: 51,
        kind,
        section: { id: 51, code: 'u05-s1', order: 1, unitId: 5 },
      })),
    },
    dafSection: {
      findMany: jest.fn(async () => [{ id: 51, code: 'u05-s1', order: 1 }]),
    },
    dafLexeme: {
      findMany: jest.fn(async () => WOERTER),
      findUnique: jest.fn(
        async ({ where }: any) =>
          WOERTER.find((w) => w.id === where.id) ?? null,
      ),
    },
    dafSentence: { findMany: jest.fn(async () => []) },
    dafPhrase: { findMany: jest.fn(async () => []) },
    dafDialog: { findMany: jest.fn(async () => []) },
    dafUhrzeit: {
      findMany: jest.fn(async (args: any = {}) => {
        const ids: number[] | undefined = args?.where?.sectionId?.in;
        return ids
          ? UHRZEITEN.filter((u) => ids.includes(u.sectionId))
          : UHRZEITEN;
      }),
      findUnique: jest.fn(
        async ({ where }: any) =>
          UHRZEITEN.find((u) => u.id === where.id) ?? null,
      ),
    },
    dafLexemeState: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ id: 1 })),
    },
    $executeRaw: jest.fn(async () => 1),
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    dafAttempt: { create: jest.fn(async () => ({ id: 1 })) },
    dafSession: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async (args: any) => args.data),
    },
    enrollment: { findFirst: jest.fn(async () => null) },
    studentBranch: { findFirst: jest.fn(async () => null) },
  };
}

const ctx = { studentId: 10001, companyId: 1 };

describe('UebungService — clock exercises', () => {
  it('a SECTION_A lesson asks the clock; the answer is never sent', async () => {
    const service = new UebungService(
      fakePrisma('SECTION_A') as any,
      fakeConfig,
    );
    const fragen = await service.seans(500, 10001, mulberry32(3));
    const uhr = fragen.filter((f) => f.itemType === 'UHRZEIT');
    expect(uhr.length).toBeGreaterThan(0);
    for (const f of uhr) {
      expect(['UHR_LESEN', 'UHR_HOEREN', 'UHR_TIPPEN']).toContain(f.format);
      expect(f).not.toHaveProperty('richtig');
      if (f.format === 'UHR_HOEREN') {
        expect(f.uhrzeit).toBeUndefined();
        expect(f.audioUrl).toMatch(/^https:\/\/media\.example\.com\//);
      } else {
        expect(f.uhrzeit).toMatch(/^\d{2}:\d{2}$/);
      }
    }
  });

  it('a lesson without clock times builds none (the table is read per section)', async () => {
    const prisma = fakePrisma('SECTION_A');
    prisma.dafUhrzeit.findMany.mockResolvedValue([]);
    const service = new UebungService(prisma as any, fakeConfig);
    const fragen = await service.seans(500, 10001, mulberry32(3));
    expect(fragen.some((f) => f.itemType === 'UHRZEIT')).toBe(false);
    expect(prisma.dafUhrzeit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sectionId: { in: [51] } } }),
    );
  });

  it('no public R2 URL — no listening clock question', async () => {
    const service = new UebungService(
      fakePrisma('SECTION_A') as any,
      { get: () => undefined } as any,
    );
    for (let seed = 1; seed <= 5; seed += 1) {
      const fragen = await service.seans(500, 10001, mulberry32(seed));
      expect(fragen.some((f) => f.format === 'UHR_HOEREN')).toBe(false);
    }
  });

  it('a SECTION_B lesson asks the student to type the time', async () => {
    const service = new UebungService(
      fakePrisma('SECTION_B') as any,
      fakeConfig,
    );
    const fragen = await service.seans(500, 10001, mulberry32(4));
    expect(fragen.some((f) => f.format === 'UHR_TIPPEN')).toBe(true);
  });

  it('UHR_TIPPEN: every correct form counts, a wrong time does not; no Leitner', async () => {
    const prisma = fakePrisma('SECTION_B');
    const service = new UebungService(prisma as any, fakeConfig);
    const pruefe = (given: string) =>
      service.pruefen(
        { itemType: 'UHRZEIT', itemId: 901, format: 'UHR_TIPPEN', given },
        ctx,
      );
    expect(await pruefe('drei Uhr dreißig')).toEqual({
      isCorrect: true,
      richtig: 'halb vier',
    });
    expect((await pruefe('Es ist halb vier.')).isCorrect).toBe(true);
    expect((await pruefe('fünfzehn Uhr dreißig')).isCorrect).toBe(true);
    expect((await pruefe('halb drei')).isCorrect).toBe(false);
    expect(prisma.dafAttempt.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        lexemeId: null,
        itemType: 'UHRZEIT',
        itemId: 901,
        format: 'UHR_TIPPEN',
        isCorrect: false,
      }),
    });
    expect(prisma.dafLexemeState.upsert).not.toHaveBeenCalled();
  });

  it('UHR_LESEN: the chosen German text against the stored time', async () => {
    const service = new UebungService(
      fakePrisma('SECTION_A') as any,
      fakeConfig,
    );
    const r = await service.pruefen(
      {
        itemType: 'UHRZEIT',
        itemId: 902,
        format: 'UHR_LESEN',
        given: 'Viertel vor acht',
      },
      ctx,
    );
    expect(r).toEqual({ isCorrect: false, richtig: 'Viertel nach sieben' });
  });

  it('UHR_HOEREN: the picked clock; the heard words come back after', async () => {
    const service = new UebungService(
      fakePrisma('SECTION_A') as any,
      fakeConfig,
    );
    const r = await service.pruefen(
      {
        itemType: 'UHRZEIT',
        itemId: 904,
        format: 'UHR_HOEREN',
        given: '12:00',
      },
      ctx,
    );
    expect(r).toEqual({
      isCorrect: true,
      richtig: '12:00',
      loesungWort: 'zwölf Uhr',
    });
  });

  it('refuses a clock format on other material and the reverse', async () => {
    const service = new UebungService(
      fakePrisma('SECTION_A') as any,
      fakeConfig,
    );
    await expect(
      service.pruefen(
        { itemType: 'WORT', itemId: 1, format: 'UHR_TIPPEN', given: 'Uhr' },
        ctx,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.pruefen(
        { itemType: 'UHRZEIT', itemId: 901, format: 'WORT_UZ', given: 'x' },
        ctx,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('the replacement after a wrong answer is another clock format', async () => {
    const service = new UebungService(
      fakePrisma('SECTION_A') as any,
      fakeConfig,
    );
    const ersatz = await service.ersatz(
      500,
      10001,
      'UHRZEIT',
      901,
      'UHR_LESEN',
    );
    expect(ersatz).not.toBeNull();
    expect(ersatz!.itemType).toBe('UHRZEIT');
    expect(ersatz!.itemId).toBe(901);
    expect(['UHR_HOEREN', 'UHR_TIPPEN']).toContain(ersatz!.format);
  });
});
