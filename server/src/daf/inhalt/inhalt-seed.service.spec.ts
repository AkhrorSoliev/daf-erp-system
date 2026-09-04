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

/** `where`ni soxta jadval qatoriga solishtiradi: `notIn`/`in`/`gt` + tenglik. */
function matches(row: Record<string, any>, where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('notIn' in cond) return !(cond.notIn as unknown[]).includes(row[key]);
      if ('in' in cond) return (cond.in as unknown[]).includes(row[key]);
      if ('gt' in cond) return row[key] > cond.gt;
      return true;
    }
    return row[key] === cond;
  });
}

/**
 * Soxta jadval — upsert qilingan qatorni TO'LIQ saqlaydi (faqat `{id}`
 * emas), shuning uchun `count`/`findMany`/`deleteMany` haqiqiy jadval
 * kabi maydonlar bo'yicha filtrlay oladi. Servis endi stale qatorlarni
 * o'chiradi/sanaydi — buni sinash uchun soxta jadval ham shuni bajarishi
 * kerak.
 */
function fakeTable(keyOf: (args: any) => string, seqRef: { n: number }) {
  const map = new Map<string, any>();
  const upsert = jest.fn(async (args: any) => {
    const k = keyOf(args);
    const existing = map.get(k);
    const row = existing ? { ...existing, ...args.update } : { id: ++seqRef.n, ...args.create };
    map.set(k, row);
    return row;
  });
  const list = () => [...map.values()];
  return {
    map,
    upsert,
    count: jest.fn(async ({ where }: any = {}) => list().filter((r) => matches(r, where ?? {})).length),
    findMany: jest.fn(async ({ where }: any = {}) =>
      list()
        .filter((r) => matches(r, where ?? {}))
        .map((r) => ({ id: r.id })),
    ),
    deleteMany: jest.fn(async ({ where }: any = {}) => {
      let count = 0;
      for (const [k, r] of map.entries()) {
        if (matches(r, where ?? {})) {
          map.delete(k);
          count += 1;
        }
      }
      return { count };
    }),
  };
}

function fakePrisma() {
  const seqRef = { n: 0 };
  const lexeme = fakeTable((a) => a.where.sourceId, seqRef);
  const sentence = fakeTable((a) => `${a.where.unitId_order?.unitId}:${a.where.unitId_order?.order}`, seqRef);
  const dialog = fakeTable((a) => a.where.code, seqRef);
  const line = fakeTable((a) => `${a.where.dialogId_order.dialogId}:${a.where.dialogId_order.order}`, seqRef);
  const grammar = fakeTable((a) => a.where.sourceId, seqRef);
  const beispiel = fakeTable((a) => `${a.where.grammarId_order.grammarId}:${a.where.grammarId_order.order}`, seqRef);
  const phrase = fakeTable((a) => a.where.code, seqRef);

  return {
    rows: {
      lexeme: lexeme.map,
      sentence: sentence.map,
      dialog: dialog.map,
      line: line.map,
      grammar: grammar.map,
      beispiel: beispiel.map,
      phrase: phrase.map,
    },
    dafSection: {
      findMany: jest.fn(async () => [{ id: 7, code: 'u01-s1', unitId: 1 }]),
    },
    dafUnit: { findFirst: jest.fn(async () => ({ id: 1, code: 'u01' })) },
    dafLexeme: { upsert: lexeme.upsert, count: lexeme.count },
    dafSentence: { upsert: sentence.upsert, count: sentence.count },
    dafDialog: { upsert: dialog.upsert, findMany: dialog.findMany, deleteMany: dialog.deleteMany, count: dialog.count },
    dafDialogLine: { upsert: line.upsert, deleteMany: line.deleteMany },
    dafGrammar: { upsert: grammar.upsert },
    dafGrammarBeispiel: { upsert: beispiel.upsert, deleteMany: beispiel.deleteMany },
    dafPhrase: { upsert: phrase.upsert, deleteMany: phrase.deleteMany, count: phrase.count },
  };
}

describe('InhaltSeedService', () => {
  it('hamma turdagi materialni yozadi', async () => {
    const prisma = fakePrisma();
    const r = await new InhaltSeedService(prisma as any).seed('u01', files());
    expect(r).toEqual({
      woerter: 1,
      saetze: 1,
      dialoge: 1,
      zeilen: 2,
      regeln: 1,
      phrasen: 1,
      staleSaetze: 0,
      staleWoerter: 0,
    });
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

  it('anzeige bor so`zda saqlanadi, yo`qida null qoladi', async () => {
    const prisma = fakePrisma();
    const f = files();
    f.woerter.woerter.push({
      sourceId: 'u01-s4-eins',
      section: 'u01-s1',
      de: 'eins',
      uz: 'bir',
      core: true,
      order: 2,
      anzeige: '1',
    });
    await new InhaltSeedService(prisma as any).seed('u01', f);
    const calls = prisma.dafLexeme.upsert.mock.calls as any[];
    const hallo = calls.find((c) => c[0].create.sourceId === 'u01-s1-hallo')[0];
    const eins = calls.find((c) => c[0].create.sourceId === 'u01-s4-eins')[0];
    expect(hallo.create.anzeige).toBeNull();
    expect(eins.create.anzeige).toBe('1');
  });

  it('ikki dialogning satrlari aralashmaydi — bitta dialogli fixture ushlay olmaydigan xato', async () => {
    const prisma = fakePrisma();
    const f = files();
    f.dialoge.dialoge.push({
      id: 'u01-d2',
      section: 'u01-s1',
      titelDe: 'Wie geht es dir?',
      titelUz: 'Ishlaring qalay?',
      zeilen: [
        { sprecher: 'Anna', de: 'Wie geht es dir?', uz: 'Ishlaring qalay?' },
        { sprecher: 'Jonas', de: 'Gut, danke.', uz: 'Yaxshi, rahmat.' },
        { sprecher: 'Anna', de: 'Freut mich.', uz: 'Xursandman.' },
      ],
    });
    const r = await new InhaltSeedService(prisma as any).seed('u01', f);
    expect(r.dialoge).toBe(2);
    expect(r.zeilen).toBe(5);

    const d1 = prisma.rows.dialog.get('u01-d1');
    const d2 = prisma.rows.dialog.get('u01-d2');
    expect(d1.id).not.toBe(d2.id);

    const linesOfD1 = [...prisma.rows.line.values()].filter((l: any) => l.dialogId === d1.id);
    const linesOfD2 = [...prisma.rows.line.values()].filter((l: any) => l.dialogId === d2.id);
    expect(linesOfD1).toHaveLength(2);
    expect(linesOfD2).toHaveLength(3);
  });

  it('ibora kodi bo`lim+funksiya ichida hisoblanadi — butun massiv indeksi emas', async () => {
    const prisma = fakePrisma();
    const f = files();
    f.redemittel.phrasen = [
      { section: 'u01-s1', funktion: 'begruessen', funktionUz: 'salomlashish', de: 'Hallo!', uz: 'Salom!' },
      { section: 'u01-s1', funktion: 'vorstellen', funktionUz: 'tanishtirish', de: 'Ich heiße Anna.', uz: 'Mening ismim Anna.' },
      { section: 'u01-s1', funktion: 'begruessen', funktionUz: 'salomlashish', de: 'Guten Tag!', uz: 'Assalomu alaykum!' },
    ];
    await new InhaltSeedService(prisma as any).seed('u01', f);
    const codes = (prisma.dafPhrase.upsert.mock.calls as any[]).map((c) => c[0].create.code);
    // Massiv tartibi begruessen, vorstellen, begruessen. Kod BUTUN massiv
    // indeksidan (i+1) hisoblansa: begruessen-1, vorstellen-2,
    // begruessen-3 chiqardi. To`g`ri xulq — har funksiya o`z hisoblagichiga
    // ega, boshqa funksiyaning yozuvi uni siljitmaydi.
    expect(codes).toEqual(['u01-s1-begruessen-1', 'u01-s1-vorstellen-1', 'u01-s1-begruessen-2']);
  });

  it('grammatika kaliti bo`lim ichida noyob va ikki marta prefikslanmagan', async () => {
    const prisma = fakePrisma();
    const f = files();
    f.grammatik.regeln.push({
      section: 'u01-s1',
      titelDe: 'Personalpronomen',
      titelUz: 'Shaxs olmoshlari',
      erklaerungUz: 'ich, du, er/sie/es...',
      beispiele: [{ de: 'Ich heiße Anna.', uz: 'Mening ismim Anna.' }],
    });
    await new InhaltSeedService(prisma as any).seed('u01', f);
    const sourceIds = (prisma.dafGrammar.upsert.mock.calls as any[]).map((c) => c[0].create.sourceId);
    expect(sourceIds).toEqual(['u01-s1-regel-1', 'u01-s1-regel-2']);
    for (const id of sourceIds) expect(id).not.toMatch(/^u01-u01-/);
  });

  it('qayta yuritilganda hech bir turdagi material takrorlanmaydi', async () => {
    const prisma = fakePrisma();
    const service = new InhaltSeedService(prisma as any);
    const f = files();
    f.dialoge.dialoge.push({
      id: 'u01-d2',
      section: 'u01-s1',
      titelDe: 'X',
      titelUz: 'Y',
      zeilen: [{ sprecher: 'Anna', de: 'X', uz: 'Y' }],
    });
    f.grammatik.regeln.push({
      section: 'u01-s1',
      titelDe: 'X',
      titelUz: 'Y',
      erklaerungUz: 'Z',
      beispiele: [{ de: 'X', uz: 'Y' }],
    });
    f.redemittel.phrasen.push({
      section: 'u01-s1',
      funktion: 'begruessen',
      funktionUz: 'salomlashish',
      de: 'X',
      uz: 'Y',
    });

    await service.seed('u01', f);
    await service.seed('u01', f);

    expect(prisma.rows.lexeme.size).toBe(1);
    expect(prisma.rows.sentence.size).toBe(1);
    expect(prisma.rows.dialog.size).toBe(2);
    expect(prisma.rows.line.size).toBe(3);
    expect(prisma.rows.grammar.size).toBe(2);
    expect(prisma.rows.beispiel.size).toBe(2);
    expect(prisma.rows.phrase.size).toBe(2);
  });

  it('faylda yo`q qator: DafDialog/DafDialogLine/DafGrammarBeispiel/DafPhrase o`chiriladi, gap/so`z faqat sanaladi', async () => {
    const prisma = fakePrisma();
    const service = new InhaltSeedService(prisma as any);

    const round1 = files();
    round1.woerter.woerter.push({
      sourceId: 'u01-s4-eins',
      section: 'u01-s1',
      de: 'eins',
      uz: 'bir',
      core: true,
      order: 2,
    });
    round1.saetze.saetze.push({
      section: 'u01-s1',
      de: 'Ich heiße Anna.',
      uz: 'Mening ismim Anna.',
      wordCount: 3,
      origin: 'GENERATED',
    });
    round1.grammatik.regeln[0].beispiele.push({ de: 'Ich bin Jonas.', uz: 'Men Jonasman.' });
    round1.dialoge.dialoge.push({
      id: 'u01-d2',
      section: 'u01-s1',
      titelDe: 'X',
      titelUz: 'Y',
      zeilen: [
        { sprecher: 'Anna', de: 'A', uz: 'A' },
        { sprecher: 'Jonas', de: 'B', uz: 'B' },
        { sprecher: 'Anna', de: 'C', uz: 'C' },
      ],
    });
    round1.redemittel.phrasen.push({
      section: 'u01-s1',
      funktion: 'begruessen',
      funktionUz: 'salomlashish',
      de: 'Guten Tag!',
      uz: 'Assalomu alaykum!',
    });

    await service.seed('u01', round1);

    // 2-yurish: 1-dialog butunlay faylda yo`q, 2-dialogdan bitta satr
    // olib tashlangan, 2-so`z/2-gap faylda yo`q, grammatika qoidasining
    // 2-misoli va 2-"begruessen" iborasi faylda yo`q.
    const round2 = files();
    round2.dialoge.dialoge = [
      {
        id: 'u01-d2',
        section: 'u01-s1',
        titelDe: 'X',
        titelUz: 'Y',
        zeilen: [
          { sprecher: 'Anna', de: 'A', uz: 'A' },
          { sprecher: 'Jonas', de: 'B', uz: 'B' },
        ],
      },
    ];

    const r2 = await service.seed('u01', round2);

    // Sonlanadi, lekin O'CHIRILMAYDI — talaba urinishi ularga bog'langan.
    expect(r2.staleWoerter).toBe(1);
    expect(r2.staleSaetze).toBe(1);
    expect(prisma.rows.lexeme.size).toBe(2);
    expect(prisma.rows.sentence.size).toBe(2);

    // O'CHIRILADI — hech kim ishora qilmaydi.
    expect(prisma.rows.dialog.has('u01-d1')).toBe(false);
    expect(prisma.rows.dialog.has('u01-d2')).toBe(true);
    expect(prisma.rows.line.size).toBe(2);
    expect(prisma.rows.beispiel.size).toBe(1);
    expect(prisma.rows.phrase.size).toBe(1);
    expect(prisma.rows.phrase.has('u01-s1-begruessen-2')).toBe(false);
    expect(prisma.rows.phrase.has('u01-s1-begruessen-1')).toBe(true);
  });

  it('dialoge bo`sh kelsa-yu, bazada dialog bor bo`lsa — rad etadi va hech narsani o`chirmaydi', async () => {
    const prisma = fakePrisma();
    const service = new InhaltSeedService(prisma as any);
    await service.seed('u01', files());
    expect(prisma.rows.dialog.size).toBe(1);
    expect(prisma.rows.line.size).toBe(2);

    const f = files();
    f.dialoge.dialoge = [];
    await expect(service.seed('u01', f)).rejects.toThrow(/u01/);
    await expect(service.seed('u01', f)).rejects.toThrow(/dialoge/);

    // Hech narsa o`chirilmagan — rad etish YOZISHDAN OLDIN sodir bo`ladi.
    expect(prisma.rows.dialog.size).toBe(1);
    expect(prisma.rows.line.size).toBe(2);
  });

  it('dialoge bo`sh kelsa-yu, bazada ham dialog yo`q bo`lsa — jim davom etadi', async () => {
    const prisma = fakePrisma();
    const f = files();
    f.dialoge.dialoge = [];
    const r = await new InhaltSeedService(prisma as any).seed('u01', f);
    expect(r.dialoge).toBe(0);
    expect(r.zeilen).toBe(0);
    // Boshqa turlar bemalol yozilaveradi — faqat dialoge bo`sh.
    expect(r.woerter).toBe(1);
    expect(r.phrasen).toBe(1);
  });

  it('redemittel bo`sh kelsa-yu, bazada ibora bor bo`lsa — rad etadi va hech narsani o`chirmaydi', async () => {
    const prisma = fakePrisma();
    const service = new InhaltSeedService(prisma as any);
    await service.seed('u01', files());
    expect(prisma.rows.phrase.size).toBe(1);

    const f = files();
    f.redemittel.phrasen = [];
    await expect(service.seed('u01', f)).rejects.toThrow(/u01/);
    await expect(service.seed('u01', f)).rejects.toThrow(/redemittel/);

    expect(prisma.rows.phrase.size).toBe(1);
  });

  it('redemittel bo`sh kelsa-yu, bazada ham ibora yo`q bo`lsa — jim davom etadi', async () => {
    const prisma = fakePrisma();
    const f = files();
    f.redemittel.phrasen = [];
    const r = await new InhaltSeedService(prisma as any).seed('u01', f);
    expect(r.phrasen).toBe(0);
    expect(r.woerter).toBe(1);
    expect(r.dialoge).toBe(1);
  });
});
