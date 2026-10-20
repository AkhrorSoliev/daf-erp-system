import { UebungService } from './uebung.service';

// The dialog picture (CEO, 2026-10-10): shown above a gap-fill dialog, and
// after a listening answer — never with the listening question, whose
// picture would show answers like «Was kauft Mia?». Kept apart from
// `uebung.service.spec.ts`, which is far past the 500-line limit.

const MEDIA = 'https://media.example.com';
const fakeConfig = { get: () => MEDIA } as any;
const KEY = 'daf/bild/0123456789abcdef0123456789abcdef.jpg';
const ctx = { studentId: 55, companyId: 1 };

const zeile = (id: number, sprecher: string, de: string) => ({
  id,
  sprecher,
  de,
  uz: `${de} (uz)`,
  izohUz: null,
});

const DIALOGE = [
  {
    id: 201,
    titelDe: 'Im Café',
    sahnaUz: null,
    sectionId: 7,
    audioKey: 'daf/audio/d1.mp3',
    imageKey: KEY,
    zeilen: [
      zeile(1, 'A', 'Hallo!'),
      zeile(2, 'B', 'Einen Kaffee, bitte.'),
      zeile(3, 'A', 'Mit Milch?'),
      zeile(4, 'B', 'Nein, danke.'),
    ],
    fragen: [
      {
        id: 401,
        frageDe: 'Was trinkt B?',
        frageUz: 'B nima ichadi?',
        richtig: 'Kaffee',
        falsch: ['Tee', 'Wasser'],
      },
    ],
  },
  {
    id: 202,
    titelDe: 'Am Bahnhof',
    sahnaUz: null,
    sectionId: 7,
    audioKey: null,
    imageKey: null,
    zeilen: [
      zeile(11, 'C', 'Wo ist der Zug?'),
      zeile(12, 'D', 'Auf Gleis drei.'),
      zeile(13, 'C', 'Wann fährt er?'),
      zeile(14, 'D', 'Um zehn Uhr.'),
    ],
    fragen: [],
  },
];

function fakePrisma(dialog: { imageKey: string | null } = DIALOGE[0]) {
  return {
    dafLesson: {
      findUnique: jest.fn(async () => ({
        id: 100,
        unitId: 1,
        sectionId: 7,
        kind: 'SECTION_A',
        section: { id: 7, code: 'u04-s1', order: 1, unitId: 1 },
      })),
    },
    dafSection: {
      findMany: jest.fn(async () => [{ id: 7, code: 'u04-s1', order: 1 }]),
    },
    dafLexeme: { findMany: jest.fn(async () => []) },
    dafSentence: { findMany: jest.fn(async () => []) },
    dafPhrase: { findMany: jest.fn(async () => []) },
    dafUhrzeit: { findMany: jest.fn(async () => []) },
    dafDialog: {
      findMany: jest.fn(async () => DIALOGE),
      findUnique: jest.fn(async () => ({
        titelDe: 'Im Café',
        sahnaUz: null,
        imageKey: dialog.imageKey,
        zeilen: DIALOGE[0].zeilen,
      })),
    },
    dafHoerFrage: {
      findUnique: jest.fn(async () => ({
        richtig: 'Kaffee',
        frageUz: 'B nima ichadi?',
        dialogId: 201,
      })),
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

const hoeren = { itemType: 'HOERFRAGE', itemId: 401, format: 'HOEREN_WAHL' };

describe('UebungService — dialog picture', () => {
  it('DIALOG_LUECKE carries the dialog picture URL', async () => {
    const svc = new UebungService(fakePrisma() as any, fakeConfig);
    let gesehen = false;
    for (let i = 0; i < 20 && !gesehen; i += 1) {
      const fragen = await svc.seans(100, 55, () => (i + 0.5) / 20);
      for (const f of fragen.filter((x) => x.format === 'DIALOG_LUECKE')) {
        const imCafe = f.titel === 'Im Café';
        expect(f.bildUrl).toBe(imCafe ? `${MEDIA}/${KEY}` : null);
        if (imCafe) gesehen = true;
      }
    }
    expect(gesehen).toBe(true);
  });

  it('HOEREN_WAHL question carries no picture', async () => {
    const svc = new UebungService(fakePrisma() as any, fakeConfig);
    for (let i = 0; i < 20; i += 1) {
      const fragen = await svc.seans(100, 55, () => (i + 0.5) / 20);
      for (const f of fragen.filter((x) => x.format === 'HOEREN_WAHL')) {
        expect(f.bildUrl).toBeNull();
        expect(JSON.stringify(f)).not.toContain(KEY);
      }
    }
  });

  it('the HOEREN_WAHL answer carries the picture URL and the title', async () => {
    const r = await new UebungService(fakePrisma() as any, fakeConfig).pruefen(
      { ...hoeren, given: 'Kaffee' } as any,
      ctx,
    );
    expect(r.transkriptBild).toBe(`${MEDIA}/${KEY}`);
    expect(r.transkriptTitel).toBe('Im Café');
  });

  it('a dialog without a picture answers null', async () => {
    const r = await new UebungService(
      fakePrisma({ imageKey: null }) as any,
      fakeConfig,
    ).pruefen({ ...hoeren, given: 'Tee' } as any, ctx);
    expect(r.transkriptBild).toBeNull();
  });

  it('no R2 base — null, never the raw key', async () => {
    const r = await new UebungService(fakePrisma() as any).pruefen(
      { ...hoeren, given: 'Kaffee' } as any,
      ctx,
    );
    expect(r.transkriptBild).toBeNull();
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
});
