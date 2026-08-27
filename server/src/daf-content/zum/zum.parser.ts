import type { CefrLevel } from '../dataset.types';

export interface ZumPage {
  title: string;
  h5pIds: number[];
  level: CefrLevel | null;
  topics: string[];
}

export interface ZumExercise {
  h5pId: number;
  /** H5P kutubxona nomi, masalan `H5P.Flashcards 1.7` — mashq turi shu. */
  library: string;
  content: unknown;
  license: string;
  attribution: string;
}

/** ZUM toifasi → bizning daraja. ZUM A1/A2 ni maydalamaydi, biz pastki chekka olamiz. */
const LEVEL_MAP: Record<string, CefrLevel> = {
  A1: 'A1.1',
  A2: 'A2.1',
  B1: 'B1',
};

/** Daraja va xizmat toifalari mavzu emas — ular ro'yxatdan chiqariladi. */
const NOT_A_TOPIC = new Set([
  'A1',
  'A2',
  'B1',
  'B2',
  'C1',
  'C2',
  'Interaktive Übungen',
  'H5P',
  'Videos',
  'Hilfe',
]);

/** `ns: 0` — maqola. Toifa (14) va fayl (6) kerak emas. */
export function parseCategoryMembers(json: string): string[] {
  const d = JSON.parse(json) as {
    query?: { categorymembers?: { ns: number; title: string }[] };
  };
  return (d.query?.categorymembers ?? [])
    .filter((m) => m.ns === 0)
    .map((m) => m.title);
}

export function parseWikitext(wikitext: string, title: string): ZumPage {
  const h5pIds = [...wikitext.matchAll(/\{\{h5p-zum\|id=(\d+)/g)].map((m) =>
    Number(m[1]),
  );
  const cats = [...wikitext.matchAll(/\[\[Kategorie:([^\]|]+)/g)].map((m) =>
    m[1].trim(),
  );

  const levelCat = cats.find((c) => c in LEVEL_MAP);

  return {
    title,
    h5pIds,
    level: levelCat ? LEVEL_MAP[levelCat] : null,
    topics: cats.filter((c) => !NOT_A_TOPIC.has(c)),
  };
}

/**
 * `ZumClient.wikitext()` xom MediaWiki konvertini qaytaradi:
 * `{"parse":{"title":"...","wikitext":{"*":"<vikimatn>"}}}`. Vikimatn shu
 * konvert ICHIDA JSON satr sifatida qochirilgan holda yotadi (masalan
 * `Interaktive Übungen` → `Interaktive Übungen`), shuning uchun uni
 * to'g'ridan-to'g'ri `parseWikitext`ga berish mumkin emas — `NOT_A_TOPIC`dagi
 * satrga mos kelmay, xizmat toifasi buzilgan matn sifatida mavzuga sizib
 * kiradi. Bu funksiya avval konvertni yechadi, keyin toza vikimatnni
 * `parseWikitext`ga uzatadi.
 *
 * Konvert buzilgan yoki vikimatn yo'q bo'lsa (bo'sh sahifa yoki API xato
 * javobi) — xato TASHLANMAYDI: bo'sh `ZumPage` (h5pIds/topics bo'sh, level
 * null) qaytariladi, xuddi hech qanday H5P yoki toifa topilmagandek.
 */
export function parseWikitextResponse(json: string, title: string): ZumPage {
  let wikitext = '';
  try {
    const d = JSON.parse(json) as {
      parse?: { wikitext?: { '*'?: string } };
    };
    wikitext = d.parse?.wikitext?.['*'] ?? '';
  } catch {
    wikitext = '';
  }
  return parseWikitext(wikitext, title);
}

/**
 * H5P mashqining mazmuni `apps.zum.de` sahifasining Drupal sozlamalari ichida
 * to'liq JSON bo'lib yotadi (~55 KB).
 *
 * `.h5p` eksporti ham ishlaydi, lekin u ~10 MB — ichida asosan H5P
 * kutubxonalari. 759 mashq uchun bu ~7 GB bekorga; sahifadan o'qish ~50
 * barobar yengil.
 *
 * Litsenziyasi ko'rsatilmagan mashq QAYTARILMAYDI (spec Q9).
 */
export function parseH5pPage(html: string): ZumExercise | null {
  const m = html.match(
    /data-drupal-selector="drupal-settings-json"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!m) return null;

  let settings: any;
  try {
    settings = JSON.parse(m[1]);
  } catch {
    return null;
  }

  const contents = settings?.h5p?.H5PIntegration?.contents;
  if (!contents) return null;

  const [cid, raw] = Object.entries(contents)[0] ?? [];
  if (!cid || !raw) return null;

  const c = raw as {
    library?: string;
    jsonContent?: string;
    metadata?: { license?: string; authors?: { name?: string }[] };
  };

  const license = c.metadata?.license ?? '';
  if (!license.trim()) return null;

  let content: unknown = null;
  try {
    content = JSON.parse(c.jsonContent ?? 'null');
  } catch {
    return null;
  }

  const authors = (c.metadata?.authors ?? [])
    .map((a) => a.name)
    .filter(Boolean)
    .join(', ');

  return {
    h5pId: Number(String(cid).replace('cid-', '')),
    library: c.library ?? '',
    content,
    license,
    attribution: `ZUM Deutsch Lernen${authors ? ` — ${authors}` : ''} — ${license}`,
  };
}
