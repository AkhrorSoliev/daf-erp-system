import type { ChapterInfo } from '../dataset.types';

const LINK_RE = /\/gg\/gr\/([a-z]+_\d+)\.html/g;

/**
 * Focus va Recommended bo'limlari sahifada CSS klassi bilan emas, SARLAVHA
 * RASMI bilan ajratilgan. Rasm fayl nomi (`ti_grammar_f.gif`) belgi sifatida
 * `alt="Focus"` dan ishonchliroq: alt matni tarjima qilinishi mumkin, fayl
 * nomi esa yo'q.
 */
const FOCUS_MARK = 'ti_grammar_f.gif';
const REC_MARK = 'ti_grammar_r.gif';

function codes(block: string): string[] {
  return [...new Set([...block.matchAll(LINK_RE)].map((m) => m[1]))];
}

/**
 * Bobning mundarija sahifasidan grammatika bog'lanishini oladi.
 *
 * Bu daraja yorliqlashning ikkinchi signali (spec Q7): DiB muallifi har bob
 * uchun qaysi grammatika MAJBURIY (Focus), qaysi biri tavsiya etilishini
 * (Recommended) o'zi belgilagan. Ya'ni bu bizning taxminimiz emas, manbaning
 * o'z qarori.
 */
export function parseChapterPage(html: string, chapter: number): ChapterInfo {
  const focusStart = html.indexOf(FOCUS_MARK);
  const recStart = html.indexOf(REC_MARK);

  if (focusStart === -1 && recStart === -1) {
    return { chapter, grammarFocus: [], grammarRecommended: [] };
  }

  const focusBlock =
    focusStart === -1
      ? ''
      : html.slice(focusStart, recStart === -1 ? html.length : recStart);
  const recBlock = recStart === -1 ? '' : html.slice(recStart);

  return {
    chapter,
    grammarFocus: codes(focusBlock),
    grammarRecommended: codes(recBlock),
  };
}
