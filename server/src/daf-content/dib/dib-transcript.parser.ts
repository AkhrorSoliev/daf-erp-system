import type { AssetRef, Transcript } from '../dataset.types';
import { decodeEntities } from './html-entities';

const DIB_LICENSE = 'CC BY 4.0';
const DIB_ATTRIBUTION =
  'Deutsch im Blick, COERLL, The University of Texas at Austin — CC BY 4.0';

function clean(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/** `<div id="...">` ichini oxirigacha emas, mos keluvchi yopilishgacha oladi. */
function panel(html: string, id: string): string | null {
  const open = html.indexOf(`<div id="${id}"`);
  if (open === -1) return null;
  let i = html.indexOf('>', open) + 1;
  let depth = 1;
  const start = i;
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

/**
 * Haqiqiy sahifada qatorlar `<p>` emas, `<li class="vidt_i">` (intervyuchi)
 * va `<li class="vidt_s">` (so'zlovchi) elementlarida keladi. Ikkalasi ham
 * transkript matni, shuning uchun sinf bo'yicha ajratilmaydi — hujjatdagi
 * ketma-ketlikda bittalab olinadi.
 */
function lines(block: string | null): { title: string; rows: string[] } {
  if (!block) return { title: '', rows: [] };
  const titleMatch = block.match(/class="vidt_th"[^>]*>([\s\S]*?)<\/div>/);
  const title = titleMatch ? clean(titleMatch[1]) : '';
  const body = titleMatch ? block.replace(titleMatch[0], '') : block;
  const rows = [...body.matchAll(/<li class="vidt_[is]"[^>]*>([\s\S]*?)<\/li>/g)]
    .map((m) => clean(m[1]))
    .filter((s) => s !== '');
  return { title, rows };
}

/**
 * Video transkript sahifasi. `vidt_g` — nemischa, `vidt_e` — inglizcha.
 *
 * Ikkala ro'yxat bir xil uzunlikda BO'LMASLIGI mumkin va bu xato emas:
 * tarjimon ba'zan ikki nemischa gapni bitta inglizcha gapga qo'shgan.
 * Shuning uchun qatorlar juftlanmaydi, alohida saqlanadi.
 */
export function parseTranscriptPage(
  html: string,
  fileId: string,
  chapter: number,
): Transcript | null {
  const de = lines(panel(html, 'vidt_g'));
  if (de.rows.length === 0) return null;
  const en = lines(panel(html, 'vidt_e'));

  const video: AssetRef = {
    sourceUrl: `https://media.la.utexas.edu/dib/video/${fileId}.mp4`,
    key: `dib/video/${fileId}.mp4`,
    kind: 'VIDEO',
    license: DIB_LICENSE,
    attribution: DIB_ATTRIBUTION,
  };

  return {
    id: fileId,
    chapter,
    titleDe: de.title,
    linesDe: de.rows,
    linesEn: en.rows,
    video,
  };
}

/**
 * DiB RSS ba'zan ikki marta UTF-8 kodlangan matn beradi: `ü` ning UTF-8
 * baytlari (0xC3 0xBC) yana bir marta UTF-8 sifatida kodlanadi va JS
 * satrida "Ã¼" ikkita alohida belgi bo'lib chiqadi. Bu naqsh aniqlanganda
 * bitta kodlash qatlami qaytariladi (baytlar Latin-1 sifatida o'qilib, UTF-8
 * sifatida qayta dekodlanadi); to'g'ri kelgan matnga tegilmaydi.
 */
export function repairDoubleEncodedUtf8(s: string): string {
  if (!/[\u00c2\u00c3][\u0080-\u00bf]/.test(s)) return s;
  const repaired = Buffer.from(s, 'latin1').toString('utf8');
  return repaired.includes('\ufffd') ? s : repaired;
}

/** Bobning video ro'yxati `rss.php?k=N&a=mp4` dan olinadi. */
export function parseVideoList(
  rssXml: string,
): { fileId: string; title: string }[] {
  const items = [...rssXml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const out: { fileId: string; title: string }[] = [];
  for (const it of items) {
    const url = it[1].match(/url="[^"]*\/mp4s\/([A-Za-z0-9_-]+)\.mp4"/);
    const title = it[1].match(/<title>([\s\S]*?)<\/title>/);
    if (url) {
      out.push({
        fileId: url[1],
        title: title ? repairDoubleEncodedUtf8(clean(title[1])) : '',
      });
    }
  }
  return out;
}
