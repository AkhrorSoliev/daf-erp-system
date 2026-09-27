import { InhaltSeedService } from './inhalt-seed.service';
import type { InhaltFiles } from './inhalt-seed.service';

// Pictures in the content seed (2026-09-27): `bilder.json` gives the key,
// `bild-plan.json` the `tippen` flag. Kept apart from
// `inhalt-seed.service.spec.ts`, which is past the 500-line limit.

const KEY = 'daf/bild/0123456789abcdef0123456789abcdef.jpg';

function files(): InhaltFiles {
  return {
    woerter: {
      unit: 'u01',
      woerter: [
        {
          sourceId: 'u01-s1-tisch',
          section: 'u01-s1',
          de: 'Tisch',
          artikel: 'der',
          uz: 'stol',
          core: true,
          order: 1,
        },
        {
          sourceId: 'u01-s1-hallo',
          section: 'u01-s1',
          de: 'hallo',
          uz: 'salom',
          core: true,
          order: 2,
        },
      ],
    },
    saetze: { unit: 'u01', saetze: [] },
    dialoge: { unit: 'u01', dialoge: [] },
    grammatik: { unit: 'u01', regeln: [] },
    redemittel: { unit: 'u01', phrasen: [] },
  };
}

/** Every table the seed touches, empty; only the word upserts matter here. */
function fakePrisma() {
  const table = () => ({
    upsert: jest.fn(async (args: any) => ({ id: 1, ...args.create })),
    count: jest.fn(async () => 0),
    findMany: jest.fn(async () => []),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  });
  return {
    dafUnit: { findFirst: jest.fn(async () => ({ id: 1, code: 'u01' })) },
    dafSection: {
      findMany: jest.fn(async () => [{ id: 7, code: 'u01-s1', unitId: 1 }]),
    },
    dafLexeme: table(),
    dafSentence: table(),
    dafDialog: table(),
    dafDialogLine: table(),
    dafGrammar: table(),
    dafGrammarBeispiel: table(),
    dafPhrase: table(),
    dafHoerFrage: table(),
  };
}

function upsertFor(prisma: ReturnType<typeof fakePrisma>, sourceId: string) {
  const calls = prisma.dafLexeme.upsert.mock.calls as any[];
  return calls.find((c) => c[0].create.sourceId === sourceId)[0];
}

describe('InhaltSeedService — pictures', () => {
  it('writes the picture key and the tippen flag of a planned word', async () => {
    const prisma = fakePrisma();
    const f = files();
    f.bilder = { 'u01-s1-tisch': KEY };
    f.bildPlan = { 'u01-s1-tisch': { szene: 'a wooden table', tippen: true } };
    await new InhaltSeedService(prisma as any).seed('u01', f);

    const tisch = upsertFor(prisma, 'u01-s1-tisch');
    expect(tisch.create.imageKey).toBe(KEY);
    expect(tisch.update.imageKey).toBe(KEY);
    expect(tisch.create.bildTippen).toBe(true);
    expect(tisch.update.bildTippen).toBe(true);
  });

  it('clears the key and the flag of a word missing from both files', async () => {
    // The manifest is the source, like `audio.json`: a key removed from it
    // must not linger in the database pointing at a picture nobody wants.
    const prisma = fakePrisma();
    const f = files();
    f.bilder = { 'u01-s1-tisch': KEY };
    f.bildPlan = { 'u01-s1-tisch': { szene: 'a wooden table', tippen: true } };
    await new InhaltSeedService(prisma as any).seed('u01', f);

    const hallo = upsertFor(prisma, 'u01-s1-hallo');
    expect(hallo.update.imageKey).toBeNull();
    expect(hallo.update.bildTippen).toBe(false);
  });

  it('does not fail when neither file is given', async () => {
    const prisma = fakePrisma();
    await new InhaltSeedService(prisma as any).seed('u01', files());
    const tisch = upsertFor(prisma, 'u01-s1-tisch');
    expect(tisch.create.imageKey).toBeNull();
    expect(tisch.create.bildTippen).toBe(false);
  });
});
