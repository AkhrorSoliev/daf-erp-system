import type { AssetRef, Lexeme } from '../dataset.types';

export const WS_LICENSE = 'CC0 1.0';
export const WS_ATTRIBUTION = 'wort.schule — CC0 1.0 (public domain)';

export interface WordSchuleEntry {
  lemma: string;
  image?: AssetRef;
  syllables?: string;
  comparative?: string;
  superlative?: string;
  synonyms?: string[];
  opposites?: string[];
  topics?: string[];
}

/**
 * Bizning leksemadan `wort.schule` lemmasini yasaydi.
 *
 * Rasm faqat bitta so'zga mos keladi: «Guten Tag!» yoki «Wie geht's?» kabi
 * iboraga tasvir tushmaydi, shuning uchun ular rad etiladi. 1 843 yozuvdan
 * taxminan 625 tasi bu shartga tushadi.
 */
export function lemmaOf(de: string): string | null {
  const t = de.trim().replace(/^(der|die|das)\s+/i, '');
  return /^[A-Za-zÄÖÜäöüß-]+$/.test(t) ? t : null;
}

export function parseWordJson(
  json: string,
  lemma: string,
): WordSchuleEntry | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }

  const imageUrl = typeof d.image_url === 'string' ? d.image_url : null;
  if (!imageUrl) return null;

  const list = (v: unknown): string[] | undefined => {
    const a = Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string')
      : [];
    return a.length > 0 ? a : undefined;
  };
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v : undefined;

  const image: AssetRef = {
    sourceUrl: imageUrl,
    key: `wort-schule/${lemma}.png`,
    kind: 'IMAGE',
    license: WS_LICENSE,
    attribution: WS_ATTRIBUTION,
  };

  return {
    lemma,
    image,
    syllables: str(d.syllables),
    comparative: str(d.comparative),
    superlative: str(d.superlative),
    synonyms: list(d.synonyms),
    opposites: list(d.opposites),
    topics: list(d.topics),
  };
}

/**
 * Leksemani boyitadi. Mavjud maydonlarga TEGMAYDI: `de`/`en` DiB'niki va
 * ular haqiqat manbai; `wort.schule` faqat qo'shimcha beradi.
 */
export function enrichLexeme(lex: Lexeme, e: WordSchuleEntry): Lexeme {
  return {
    ...lex,
    ...(e.image ? { image: e.image } : {}),
    ...(e.syllables ? { syllables: e.syllables } : {}),
    ...(e.comparative ? { comparative: e.comparative } : {}),
    ...(e.superlative ? { superlative: e.superlative } : {}),
    ...(e.synonyms ? { synonyms: e.synonyms } : {}),
    ...(e.opposites ? { opposites: e.opposites } : {}),
    ...(e.topics ? { wsTopics: e.topics } : {}),
  };
}
