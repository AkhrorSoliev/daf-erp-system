import type { CefrLevel, ChapterInfo } from './dataset.types';
import { CHAPTER_LEVEL, GRAMMAR_LEVEL, LEVEL_ORDER } from './grammar-levels';

export interface LevelLabel {
  level: CefrLevel;
  /** Ikki signal bir-biriga qattiq zid kelganda o'qituvchi ko'rigi kerak. */
  needsReview: boolean;
  /** Qaror qanday chiqqani — hisobotda ko'rsatiladi. */
  reason: string;
}

/**
 * Bobning darajasi ikki signaldan hisoblanadi (spec Q7):
 *   1. bob tartibi — muallifning progressiyasi;
 *   2. Focus grammatikasining eng yuqori darajasi.
 * Natija — ikkisining kattarog'i.
 *
 * Recommended grammatika ATAYIN hisobga olinmaydi: u «xohlasangiz qarang»
 * degani va bobning majburiy talabini oshirmaydi.
 */
export function labelChapter(info: ChapterInfo): LevelLabel {
  const base = CHAPTER_LEVEL[info.chapter] ?? 'A1.1';
  const baseIdx = LEVEL_ORDER.indexOf(base);

  let topIdx = baseIdx;
  let topCode = '';
  for (const code of info.grammarFocus) {
    const lvl = GRAMMAR_LEVEL[code];
    if (!lvl) continue;
    const idx = LEVEL_ORDER.indexOf(lvl);
    if (idx > topIdx) {
      topIdx = idx;
      topCode = code;
    }
  }

  const level = LEVEL_ORDER[topIdx];
  const gap = topIdx - baseIdx;

  return {
    level,
    needsReview: gap > 1,
    reason: topCode
      ? `bob ${info.chapter} → ${base}, lekin \`${topCode}\` → ${level}`
      : `bob ${info.chapter} → ${base}`,
  };
}
