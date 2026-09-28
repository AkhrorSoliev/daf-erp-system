import { BadRequestException } from '@nestjs/common';
import { UebungService } from './uebung.service';

// Picture formats inside the engine (2026-09-27): sessions, the Leitner
// review and answer checking. Kept apart from `uebung.service.spec.ts`,
// which is already far past the 500-line limit for new code.

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

interface Row {
  id: number;
  de: string;
  uz: string;
  artikel: string | null;
  anzeige: null;
  core: boolean;
  sectionId: number;
  unitId: number;
  audioKey: string | null;
  imageKey: string | null;
  bildTippen: boolean;
}

function row(
  id: number,
  de: string,
  uz: string,
  artikel: string | null,
  opts: { audio?: boolean; bild?: boolean; tippen?: boolean } = {},
): Row {
  return {
    id,
    de,
    uz,
    artikel,
    anzeige: null,
    core: true,
    sectionId: 7,
    unitId: 1,
    audioKey: opts.audio === false ? null : `daf/audio/a${id}.mp3`,
    imageKey: opts.bild === false ? null : `daf/bild/b${id}.jpg`,
    bildTippen: opts.tippen ?? false,
  };
}

interface State {
  lexemeId: number;
  lastFormat: string | null;
  dueAt: Date;
}

/**
 * The smallest database the engine needs. `dafLexeme.findMany` and
 * `dafLexemeState.findMany` honour the filters the service sends
 * (`id in`, `sectionId in`, `dueAt lte`), so the review reads exactly the
 * due words it asked for.
 */
function fakePrisma(lexeme: Row[], states: State[] = []) {
  return {
    dafLesson: {
      findUnique: jest.fn(async () => ({
        id: 100,
        unitId: 1,
        sectionId: 7,
        kind: 'SECTION_A',
        section: { id: 7, code: 'u03-s1', order: 1, unitId: 1 },
      })),
    },
    dafSection: {
      findMany: jest.fn(async () => [{ id: 7, code: 'u03-s1', order: 1 }]),
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
        return rows;
      }),
      findUnique: jest.fn(
        async ({ where }: any) => lexeme.find((l) => l.id === where.id) ?? null,
      ),
    },
    dafSentence: { findMany: jest.fn(async () => []) },
    dafPhrase: { findMany: jest.fn(async () => []) },
    dafDialog: { findMany: jest.fn(async () => []) },
    dafLexemeState: {
      findMany: jest.fn(async (args: any = {}) => {
        const where = args?.where ?? {};
        let rows = states;
        if (where.dueAt?.lte) {
          const lte = where.dueAt.lte as Date;
          rows = rows.filter((s) => s.dueAt.getTime() <= lte.getTime());
        }
        if (where.lexemeId?.in) {
          rows = rows.filter((s) => where.lexemeId.in.includes(s.lexemeId));
        }
        return rows;
      }),
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ id: 1 })),
    },
    dafAttempt: { create: jest.fn(async () => ({ id: 1 })) },
    dafSession: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async (args: any) => args.data),
    },
    enrollment: { findFirst: jest.fn(async () => null) },
    studentBranch: { findFirst: jest.fn(async () => null) },
  };
}

const BAHNHOF = row(1, 'Bahnhof', 'vokzal', 'der', { tippen: true });
const SECTION = [
  BAHNHOF,
  row(2, 'Post', 'pochta', 'die'),
  row(3, 'Kino', 'kino', 'das'),
  row(4, 'Bank', 'bank', 'die'),
  row(5, 'Park', 'park', 'der'),
  row(6, 'Schule', 'maktab', 'die'),
  row(7, 'Apotheke', 'dorixona', 'die'),
  row(8, 'Hotel', 'mehmonxona', 'das'),
];
const bildUrl = (id: number): string => `${MEDIA}/daf/bild/b${id}.jpg`;
const ctx = { studentId: 55, companyId: 1 };

describe('UebungService.pruefen — picture formats', () => {
  const service = (lexeme: Row[] = SECTION) =>
    new UebungService(fakePrisma(lexeme) as any, fakeConfig);

  it('BILD_WORT: the word`s own picture is correct, and the word is sent back', async () => {
    const r = await service().pruefen(
      { itemType: 'WORT', itemId: 1, format: 'BILD_WORT', given: bildUrl(1) },
      ctx,
    );
    expect(r.isCorrect).toBe(true);
    expect(r.richtig).toBe(bildUrl(1));
    expect(r.loesungWort).toBe('der Bahnhof');
  });

  it('AUDIO_BILD: another word`s picture is wrong, the word is still sent back', async () => {
    const r = await service().pruefen(
      { itemType: 'WORT', itemId: 1, format: 'AUDIO_BILD', given: bildUrl(2) },
      ctx,
    );
    expect(r.isCorrect).toBe(false);
    expect(r.richtig).toBe(bildUrl(1));
    expect(r.loesungWort).toBe('der Bahnhof');
  });

  it('BILD_WORT: a URL that differs only in case is not the picture', async () => {
    const r = await service().pruefen(
      {
        itemType: 'WORT',
        itemId: 1,
        format: 'BILD_WORT',
        given: bildUrl(1).toUpperCase(),
      },
      ctx,
    );
    expect(r.isCorrect).toBe(false);
  });

  it('BILD_WORT: a word without a picture is refused', async () => {
    const ohneBild = [row(1, 'Bahnhof', 'vokzal', 'der', { bild: false })];
    await expect(
      service(ohneBild).pruefen(
        { itemType: 'WORT', itemId: 1, format: 'BILD_WORT', given: 'x' },
        ctx,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('BILD_WORT: refused for anything but a word', async () => {
    const prisma = fakePrisma(SECTION) as any;
    prisma.dafSentence.findUnique = jest.fn(async () => ({
      de: 'Ich bin Anna.',
      uz: 'Men Annaman.',
      akzeptiert: [],
    }));
    await expect(
      new UebungService(prisma, fakeConfig).pruefen(
        { itemType: 'SATZ', itemId: 11, format: 'BILD_WORT', given: 'x' },
        ctx,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('BILD_TIPPEN: the word with its article is correct, spelling forgiven', async () => {
    const r = await service().pruefen(
      {
        itemType: 'WORT',
        itemId: 1,
        format: 'BILD_TIPPEN',
        given: 'der bahnhof',
      },
      ctx,
    );
    expect(r.isCorrect).toBe(true);
    expect(r.richtig).toBe('der Bahnhof');
    expect(r.loesungWort).toBe('der Bahnhof');
  });

  it('BILD_TIPPEN: the article is required', async () => {
    const r = await service().pruefen(
      { itemType: 'WORT', itemId: 1, format: 'BILD_TIPPEN', given: 'Bahnhof' },
      ctx,
    );
    expect(r.isCorrect).toBe(false);
  });

  it('other formats send no loesungWort', async () => {
    const r = await service().pruefen(
      { itemType: 'WORT', itemId: 1, format: 'WORT_UZ', given: 'vokzal' },
      ctx,
    );
    expect(r.isCorrect).toBe(true);
    expect(r).not.toHaveProperty('loesungWort');
  });
});

describe('UebungService.seans — picture formats', () => {
  it('a section whose words have pictures asks with four picture options', async () => {
    const fragen = await new UebungService(
      fakePrisma(SECTION) as any,
      fakeConfig,
    ).seans(100, 55, mulberry32(7));

    const bild = fragen.filter(
      (f) => f.format === 'BILD_WORT' || f.format === 'AUDIO_BILD',
    );
    expect(bild.length).toBeGreaterThan(0);
    for (const f of bild) {
      expect(f.options).toHaveLength(4);
      for (const o of f.options) {
        expect(o.startsWith(`${MEDIA}/daf/bild/`)).toBe(true);
      }
    }
  });

  it('a section without pictures never asks a picture question', async () => {
    const ohneBild = SECTION.map((w) => ({
      ...w,
      imageKey: null,
      bildTippen: false,
    }));
    const fragen = await new UebungService(
      fakePrisma(ohneBild) as any,
      fakeConfig,
    ).seans(100, 55, mulberry32(7));
    expect(fragen.length).toBeGreaterThan(0);
    expect(
      fragen.filter(
        (f) => f.format.startsWith('BILD') || f.format === 'AUDIO_BILD',
      ),
    ).toEqual([]);
  });
});

describe('UebungService.wiederholung — picture formats', () => {
  const eski = new Date(Date.now() - 60_000);
  const spaeter = new Date(Date.now() + 86_400_000);

  it('a due word can come back as BILD_TIPPEN', async () => {
    // One seen word, no audio, no other words: WORT_UZ/UZ_WORT/BILD_WORT
    // have no distractors, the audio formats have no audio and ARTIKEL was
    // the last format, so BILD_TIPPEN is the only question left.
    const wort = row(1, 'Bahnhof', 'vokzal', 'der', {
      audio: false,
      tippen: true,
    });
    const fragen = await new UebungService(
      fakePrisma(
        [wort],
        [{ lexemeId: 1, lastFormat: 'ARTIKEL', dueAt: eski }],
      ) as any,
      fakeConfig,
    ).wiederholung(55);
    expect(fragen).toHaveLength(1);
    expect(fragen[0].format).toBe('BILD_TIPPEN');
    expect(fragen[0].bildUrl).toBe(bildUrl(1));
  });

  it('a due word can come back as BILD_WORT', async () => {
    // The other seen words share the target's translation, so WORT_UZ has
    // no distractors; UZ_WORT was the last format; no article and no audio
    // rule out the rest. BILD_WORT is the only question left.
    const wort = row(1, 'Bahnhof', 'vokzal', null, { audio: false });
    const andere = [
      row(2, 'Hauptbahnhof', 'vokzal', null, { audio: false }),
      row(3, 'Station', 'vokzal', null, { audio: false }),
      row(4, 'Bahnstation', 'vokzal', null, { audio: false }),
    ];
    const fragen = await new UebungService(
      fakePrisma(
        [wort, ...andere],
        [
          { lexemeId: 1, lastFormat: 'UZ_WORT', dueAt: eski },
          { lexemeId: 2, lastFormat: null, dueAt: spaeter },
          { lexemeId: 3, lastFormat: null, dueAt: spaeter },
          { lexemeId: 4, lastFormat: null, dueAt: spaeter },
        ],
      ) as any,
      fakeConfig,
    ).wiederholung(55);
    expect(fragen).toHaveLength(1);
    expect(fragen[0].format).toBe('BILD_WORT');
    expect(fragen[0].options).toContain(bildUrl(1));
  });
});
