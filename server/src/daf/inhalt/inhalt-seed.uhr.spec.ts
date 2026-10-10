import { InhaltSeedService } from './inhalt-seed.service';
import type { InhaltFiles } from './inhalt-seed.service';
import { uhrTextHash } from './uhrzeiten';

// Clock times in the content seed: `uhrzeiten.json` lists them per
// section, `uhr-audio.json` gives the audio. Kept apart from
// `inhalt-seed.service.spec.ts`, which is past the 500-line limit.

function files(): InhaltFiles {
  return {
    woerter: {
      unit: 'u05',
      woerter: [
        {
          sourceId: 'u05-s1-uhr',
          section: 'u05-s1',
          de: 'Uhr',
          artikel: 'die',
          uz: 'soat',
          core: true,
          order: 1,
        },
      ],
    },
    saetze: { unit: 'u05', saetze: [] },
    dialoge: { unit: 'u05', dialoge: [] },
    grammatik: { unit: 'u05', regeln: [] },
    redemittel: { unit: 'u05', phrasen: [] },
  };
}

function fakePrisma(uhrInDb = 0) {
  const table = () => ({
    upsert: jest.fn(async (args: any) => ({ id: 1, ...args.create })),
    count: jest.fn(async () => 0),
    findMany: jest.fn(async () => []),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  });
  const uhr = table();
  uhr.count.mockResolvedValue(uhrInDb);
  return {
    dafUnit: { findFirst: jest.fn(async () => ({ id: 5, code: 'u05' })) },
    dafSection: {
      findMany: jest.fn(async () => [
        { id: 51, code: 'u05-s1', unitId: 5 },
        { id: 52, code: 'u05-s2', unitId: 5 },
      ]),
    },
    dafLexeme: table(),
    dafSentence: table(),
    dafDialog: table(),
    dafDialogLine: table(),
    dafGrammar: table(),
    dafGrammarBeispiel: table(),
    dafPhrase: table(),
    dafHoerFrage: table(),
    dafUhrzeit: uhr,
  };
}

describe('InhaltSeedService — clock times', () => {
  it('writes the unit`s times with their audio and clears the rest', async () => {
    const prisma = fakePrisma();
    const f = files();
    f.uhrzeiten = {
      'u05-s1': [{ zeit: '03:30' }, { zeit: '07:15' }],
      'u06-s1': [{ zeit: '09:00' }],
    };
    f.uhrAudio = {
      '03:30': { key: 'daf/audio/a.mp3', textHash: uhrTextHash('03:30') },
      '07:15': { key: 'daf/audio/old.mp3', textHash: 'eskirgan' },
    };
    const r = await new InhaltSeedService(prisma as any).seed('u05', f);

    expect(r.uhrzeiten).toBe(2);
    const upserts = prisma.dafUhrzeit.upsert.mock.calls.map((c: any[]) => c[0]);
    expect(upserts).toEqual([
      {
        where: { sectionId_zeit: { sectionId: 51, zeit: '03:30' } },
        create: { sectionId: 51, zeit: '03:30', audioKey: 'daf/audio/a.mp3' },
        update: { audioKey: 'daf/audio/a.mp3' },
      },
      {
        where: { sectionId_zeit: { sectionId: 51, zeit: '07:15' } },
        create: { sectionId: 51, zeit: '07:15', audioKey: null },
        update: { audioKey: null },
      },
    ]);
    // Every section of the unit is synced: a time removed from the file
    // goes, a section with none left is emptied.
    expect(
      prisma.dafUhrzeit.deleteMany.mock.calls.map((c: any[]) => c[0]),
    ).toEqual([
      { where: { sectionId: 51, zeit: { notIn: ['03:30', '07:15'] } } },
      { where: { sectionId: 52, zeit: { notIn: [] } } },
    ]);
  });

  it('touches nothing when the file is not given', async () => {
    const prisma = fakePrisma();
    const r = await new InhaltSeedService(prisma as any).seed('u05', files());
    expect(r.uhrzeiten).toBe(0);
    expect(prisma.dafUhrzeit.upsert).not.toHaveBeenCalled();
    expect(prisma.dafUhrzeit.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a broken time before writing anything', async () => {
    const prisma = fakePrisma();
    const f = files();
    f.uhrzeiten = { 'u05-s1': [{ zeit: '15:30' }] };
    await expect(
      new InhaltSeedService(prisma as any).seed('u05', f),
    ).rejects.toThrow('15:30');
    expect(prisma.dafLexeme.upsert).not.toHaveBeenCalled();
  });

  it('refuses a section the unit does not have', async () => {
    const prisma = fakePrisma();
    const f = files();
    f.uhrzeiten = { 'u05-s9': [{ zeit: '03:30' }] };
    await expect(
      new InhaltSeedService(prisma as any).seed('u05', f),
    ).rejects.toThrow('u05-s9');
  });

  it('a file with none of the unit`s times does not wipe the ones in the database', async () => {
    const prisma = fakePrisma(4);
    const f = files();
    f.uhrzeiten = { 'u06-s1': [{ zeit: '09:00' }] };
    await expect(
      new InhaltSeedService(prisma as any).seed('u05', f),
    ).rejects.toThrow('uhrzeiten');
    expect(prisma.dafUhrzeit.deleteMany).not.toHaveBeenCalled();
  });
});
