import { decodeEntities } from './html-entities';

export interface AudSection {
  /** `fp_02` dagi 2. */
  index: number;
  audioUrl: string | null;
  /** `ps_NN` ning ichki HTML'i — keyingi parser uni o'zicha o'qiydi. */
  contentHtml: string;
  /** Bo'limdan oldingi kursiv izoh, masalan «Listen to the dialogue:». */
  caption: string;
}

// Manba so'z ICHIDA bitta harfni belgilash uchun `<span>` ishlatadi (masalan
// `A<span>usland</span>` — "Ausland" ichidagi "A" ta'kidlangan). Bu kabi teglar
// bo'shliq bilan almashtirilsa, so'z ikkiga bo'linib ketadi: "A usland". Shuning
// uchun matn ICHIDA joylashadigan teglar bo'shliqsiz olib tashlanadi; qatorlarni
// AJRATIB turadigan teglar (`<br>`, `<p>`, `<div>`, jadval teglari) esa, avvalgidek,
// bo'shliqqa almashtiriladi — ular orasida so'zlar tabiiy ravishda tutashib qolmaydi.
const INLINE_TAG_RE =
  /<\/?(span|b|i|em|strong|a|u|sup|sub|small)(?:\s[^>]*)?>/gi;

export function stripTags(html: string): string {
  return decodeEntities(
    html.replace(INLINE_TAG_RE, '').replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const FP_RE = /<div id="fp_(\d+)"/g;
const SOURCE_RE = /<source[^>]*src="([^"]+)"/;

/**
 * DiB'ning grammatika (bosma) va talaffuz sahifalari bir xil qolipda yozilgan:
 * har audio uchun `fp_NN` (pleyer), undan keyin `ps_NN` (yonidagi mazmun), va
 * `ps_NN_t` (bo'sh, vertikal siljish uchun). Shuning uchun bitta ajratgich
 * ikkala sahifa turiga ham yetadi.
 *
 * `ps_NN` ichida jadval bo'lishi mumkin, lekin ichma-ich `div` bo'lgani uchun
 * yopilish tegi sanab topiladi — lazy regex ikkinchi bo'limni birinchisiga
 * qo'shib yuborardi.
 */
export function parseAudSections(html: string): AudSection[] {
  const out: AudSection[] = [];

  for (const m of [...html.matchAll(FP_RE)]) {
    const index = Number(m[1]);
    const pad = String(index).padStart(2, '0');

    const fpStart = m.index ?? 0;
    const psTag = `<div id="ps_${pad}"`;
    const psStart = html.indexOf(psTag, fpStart);
    if (psStart === -1) continue;

    const audioBlock = html.slice(fpStart, psStart);
    const src = audioBlock.match(SOURCE_RE);

    out.push({
      index,
      audioUrl: src ? src[1] : null,
      contentHtml: readDiv(html, psStart),
      caption: captionBefore(html, fpStart),
    });
  }

  return out;
}

/** `<div …>` ning ichini mos keluvchi yopilishgacha oladi. */
function readDiv(html: string, openAt: number): string {
  let i = html.indexOf('>', openAt) + 1;
  const start = i;
  let depth = 1;

  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + 4;
    } else {
      depth--;
      i = nextClose + 6;
    }
  }

  return html.slice(start, Math.max(start, i - 6));
}

/** Audio blokidan oldingi eng yaqin kursiv izoh. */
function captionBefore(html: string, fpStart: number): string {
  const before = html.slice(0, fpStart);
  const matches = [
    ...before.matchAll(/<p[^>]*>\s*<i>([\s\S]*?)<\/i>\s*<\/p>/g),
  ];
  const last = matches[matches.length - 1];
  return last ? stripTags(last[1]) : '';
}
