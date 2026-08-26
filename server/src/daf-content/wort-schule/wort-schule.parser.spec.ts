import {
  lemmaOf,
  parseWordJson,
  enrichLexeme,
  WS_LICENSE,
} from './wort-schule.parser';
import type { Lexeme } from '../dataset.types';
import { WortSchuleAdapter } from './wort-schule.adapter';

const JSON_OK = JSON.stringify({
  name: 'dick',
  word_type: 'Adjektiv',
  meaning: 'massig, nicht dünn',
  syllables: 'dick',
  comparative: 'dicker',
  superlative: 'dicksten',
  image_url:
    'https://wort.schule/rails/active_storage/blobs/proxy/abc/dick%204c.png',
  synonyms: ['mollig'],
  opposites: ['dünn', 'schlank'],
  topics: ['Tiere'],
});

// Haqiqiy javob shakli: «laufen» rasmga ega emas, lekin bo'g'in, sinonim va
// mavzular bilan to'la — bular faqat rasm yo'qligi sababli yo'qolmasligi kerak.
const JSON_LAUFEN = JSON.stringify({
  name: 'laufen',
  word_type: 'Verb',
  meaning: 'sich zu Fuß fortbewegen',
  syllables: 'lau-fen',
  image_url: null,
  synonyms: ['rennen'],
  topics: ['Sport', 'Bewegung', 'Schule', 'Freizeit', 'Alltag', 'Verben'],
});

describe('lemmaOf', () => {
  it('artiklni olib tashlaydi', () => {
    expect(lemmaOf('der Tisch')).toBe('Tisch');
    expect(lemmaOf('die Schule')).toBe('Schule');
    expect(lemmaOf('das Buch')).toBe('Buch');
  });

  it("artiklsiz so'zni o'zgartirmaydi", () => {
    expect(lemmaOf('lesen')).toBe('lesen');
  });

  it("ko'p so'zli iborani rad etadi", () => {
    expect(lemmaOf('Guten Tag!')).toBeNull();
    expect(lemmaOf("Wie geht's?")).toBeNull();
  });

  it('tinish belgisi bor yozuvni rad etadi', () => {
    expect(lemmaOf('Hallo!')).toBeNull();
  });
});

describe('parseWordJson', () => {
  it('rasmni CC0 litsenziyasi bilan beradi', () => {
    const e = parseWordJson(JSON_OK, 'dick')!;
    expect(e.image!.license).toBe(WS_LICENSE);
    expect(e.image!.kind).toBe('IMAGE');
    expect(e.image!.key).toBe('wort-schule/dick.png');
  });

  it("grammatik metama'lumotni oladi", () => {
    const e = parseWordJson(JSON_OK, 'dick')!;
    expect(e.syllables).toBe('dick');
    expect(e.comparative).toBe('dicker');
    expect(e.opposites).toEqual(['dünn', 'schlank']);
    expect(e.topics).toEqual(['Tiere']);
  });

  it("rasmi yo'q, lekin metama'lumoti bor «laufen» kabi yozuvni saqlaydi", () => {
    const e = parseWordJson(JSON_LAUFEN, 'laufen')!;
    expect(e).not.toBeNull();
    expect(e.image).toBeUndefined();
    expect(e.syllables).toBe('lau-fen');
    expect(e.synonyms).toEqual(['rennen']);
    expect(e.topics).toHaveLength(6);
  });

  it("foydali maydoni bo'lmagan yozuv uchun null qaytaradi", () => {
    const empty = JSON.stringify({ name: 'x', image_url: null });
    expect(parseWordJson(empty, 'x')).toBeNull();
  });

  it("rasm URL'idagi kengaytmani ishlatadi, uni .png deb faraz qilmaydi", () => {
    const jpg = JSON.stringify({ name: 'x', image_url: 'https://w/x.jpg' });
    const e = parseWordJson(jpg, 'x')!;
    expect(e.image!.key).toBe('wort-schule/x.jpg');
  });

  it('buzuq JSON uchun null qaytaradi, xato tashlamaydi', () => {
    expect(parseWordJson('<html>404</html>', 'x')).toBeNull();
  });
});

describe('enrichLexeme', () => {
  const base: Lexeme = { de: 'dick', en: 'thick', sectionId: 's1' };

  it("mavjud maydonlarni o'zgartirmaydi", () => {
    const e = parseWordJson(JSON_OK, 'dick')!;
    const out = enrichLexeme(base, e);
    expect(out.de).toBe('dick');
    expect(out.en).toBe('thick');
    expect(out.sectionId).toBe('s1');
  });

  it("rasm va metama'lumotni qo'shadi", () => {
    const e = parseWordJson(JSON_OK, 'dick')!;
    const out = enrichLexeme(base, e);
    expect(out.image!.key).toBe('wort-schule/dick.png');
    expect(out.syllables).toBe('dick');
    expect(out.synonyms).toEqual(['mollig']);
  });

  it("bo'sh massivni qo'shmaydi", () => {
    const e = parseWordJson(
      JSON.stringify({ name: 'x', image_url: 'https://w/x.png', synonyms: [] }),
      'x',
    )!;
    const out = enrichLexeme(base, e);
    expect(out.synonyms).toBeUndefined();
  });

  it('yangi yozuv bermagan mavjud ixtiyoriy maydonni saqlab qoladi', () => {
    const withSyllables: Lexeme = { ...base, syllables: 'eski-band' };
    const noSyllables = parseWordJson(
      JSON.stringify({ name: 'x', image_url: 'https://w/x.png' }),
      'x',
    )!;
    const out = enrichLexeme(withSyllables, noSyllables);
    expect(out.syllables).toBe('eski-band');
  });
});

describe('WortSchuleAdapter', () => {
  function makeAdapter(byLemma: Record<string, string | null>) {
    const client = {
      fetchWord: jest.fn(async (l: string) => byLemma[l] ?? null),
    };
    return new WortSchuleAdapter(Object.keys(byLemma), client as never);
  }

  it("topilmagan lemmani oqimga qo'shmaydi", async () => {
    const a = makeAdapter({ dick: JSON_OK, yoq: null });
    const got: string[] = [];
    for await (const raw of a.harvest()) got.push(raw.lemma);
    expect(got).toEqual(['dick']);
  });

  it('map sof funksiya — tarmoqqa tegmaydi', () => {
    const a = makeAdapter({});
    expect(a.map({ lemma: 'dick', json: JSON_OK })!.syllables).toBe('dick');
  });

  it("assets faqat rasmni qaytaradi va u CC0 bo'ladi", () => {
    const a = makeAdapter({});
    const assets = a.assets({ lemma: 'dick', json: JSON_OK });
    expect(assets).toHaveLength(1);
    expect(assets[0].license).toBe(WS_LICENSE);
  });

  it("rasmi yo'q yozuv uchun bo'sh aktiv ro'yxati", () => {
    const a = makeAdapter({});
    const noImg = JSON.stringify({ name: 'x', image_url: null });
    expect(a.assets({ lemma: 'x', json: noImg })).toEqual([]);
  });
});
