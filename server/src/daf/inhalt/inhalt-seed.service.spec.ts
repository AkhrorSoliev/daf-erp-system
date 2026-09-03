import { InhaltSeedService } from './inhalt-seed.service';
import type { InhaltFiles } from './inhalt-seed.service';

function files(): InhaltFiles {
  return {
    woerter: {
      unit: 'u01',
      woerter: [
        { sourceId: 'u01-s1-hallo', section: 'u01-s1', de: 'hallo', uz: 'salom', core: true, order: 1 },
      ],
    },
    saetze: {
      unit: 'u01',
      saetze: [
        { section: 'u01-s1', de: 'Ich bin Anna.', uz: 'Men Annaman.', wordCount: 3, origin: 'GENERATED' },
      ],
    },
    dialoge: {
      unit: 'u01',
      dialoge: [
        {
          id: 'u01-d1',
          section: 'u01-s1',
          titelDe: 'Hallo!',
          titelUz: 'Salom!',
          zeilen: [
            { sprecher: 'Anna', de: 'Hallo!', uz: 'Salom!' },
            { sprecher: 'Jonas', de: 'Hallo Anna!', uz: 'Salom Anna!' },
          ],
        },
      ],
    },
    grammatik: {
      unit: 'u01',
      regeln: [
        {
          section: 'u01-s1',
          titelDe: 'sein',
          titelUz: 'sein fe`li',
          erklaerungUz: 'sein fe`li shaxsga qarab o`zgaradi: ich bin, du bist.',
          beispiele: [{ de: 'Ich bin Anna.', uz: 'Men Annaman.' }],
        },
      ],
    },
    redemittel: {
      unit: 'u01',
      phrasen: [
        { section: 'u01-s1', funktion: 'begruessen', funktionUz: 'salomlashish', de: 'Hallo!', uz: 'Salom!' },
      ],
    },
  };
}

function fakePrisma() {
  const rows = { lexeme: new Map(), sentence: new Map(), dialog: new Map(), line: new Map(), grammar: new Map(), beispiel: new Map(), phrase: new Map() };
  let seq = 0;
  const upsert = (store: Map<string, { id: number }>, keyOf: (a: any) => string) =>
    jest.fn(async (args: any) => {
      const k = keyOf(args);
      if (!store.has(k)) store.set(k, { id: ++seq });
      return store.get(k);
    });

  return {
    rows,
    dafSection: {
      findMany: jest.fn(async () => [{ id: 7, code: 'u01-s1', unitId: 1 }]),
    },
    dafUnit: { findFirst: jest.fn(async () => ({ id: 1, code: 'u01' })) },
    dafLexeme: { upsert: upsert(rows.lexeme, (a) => a.where.sourceId) },
    dafSentence: { upsert: upsert(rows.sentence, (a) => `${a.where.unitId_order?.unitId}:${a.where.unitId_order?.order}`) },
    dafDialog: { upsert: upsert(rows.dialog, (a) => a.where.code) },
    dafDialogLine: { upsert: upsert(rows.line, (a) => `${a.where.dialogId_order.dialogId}:${a.where.dialogId_order.order}`) },
    dafGrammar: { upsert: upsert(rows.grammar, (a) => a.where.sourceId) },
    dafGrammarBeispiel: { upsert: upsert(rows.beispiel, (a) => `${a.where.grammarId_order.grammarId}:${a.where.grammarId_order.order}`) },
    dafPhrase: { upsert: upsert(rows.phrase, (a) => a.where.code) },
  };
}

describe('InhaltSeedService', () => {
  it('hamma turdagi materialni yozadi', async () => {
    const prisma = fakePrisma();
    const r = await new InhaltSeedService(prisma as any).seed('u01', files());
    expect(r).toEqual({ woerter: 1, saetze: 1, dialoge: 1, zeilen: 2, regeln: 1, phrasen: 1 });
  });

  it('so`zni bo`limga bog`laydi', async () => {
    const prisma = fakePrisma();
    await new InhaltSeedService(prisma as any).seed('u01', files());
    const call = prisma.dafLexeme.upsert.mock.calls[0][0] as any;
    expect(call.create.sectionId).toBe(7);
  });

  it('xaritada yo`q bo`lim kaliti bo`lsa rad etadi', async () => {
    const prisma = fakePrisma();
    const f = files();
    f.woerter.woerter[0].section = 'u01-s9';
    await expect(new InhaltSeedService(prisma as any).seed('u01', f)).rejects.toThrow('u01-s9');
  });

  it('qayta yuritilganda takrorlamaydi', async () => {
    const prisma = fakePrisma();
    const service = new InhaltSeedService(prisma as any);
    await service.seed('u01', files());
    await service.seed('u01', files());
    expect(prisma.rows.lexeme.size).toBe(1);
    expect(prisma.rows.line.size).toBe(2);
  });
});
