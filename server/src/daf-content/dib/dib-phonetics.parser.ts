import type { PhoneticsItem } from '../dataset.types';
import { parseAudSections, stripTags } from './aud-section.parser';
import { DIB_LICENSE, DIB_ATTRIBUTION } from './dib-license';

const OVERLIB_RE = /overlib\('((?:[^'\\]|\\.)*)'\)/g;

/**
 * Talaffuz sahifasi grammatika bilan bir xil qolipda, shuning uchun bo'limlar
 * o'sha ajratgich bilan olinadi.
 *
 * Inglizcha izoh matnda emas, `onmouseover="return overlib('…')"` ichida
 * turadi: sahifada u sichqoncha ostida chiqadigan qalqib chiquvchi oyna.
 *
 * Payload ichida ba'zan `<br />` bor (masalan 4-bobning qofiyali mashqlari,
 * har qatordan keyin) — `textDe` uchun ishlatilgan `stripTags` shu yerga
 * qo'llanilmagan edi, faqat `decodeEntities`, shuning uchun xom `<br />`
 * `textEn`ga sizib chiqardi. Endi ikkalasi ham bir xil `stripTags` orqali
 * o'tadi (u o'zi entity'larni ham dekodlaydi).
 */
export function parsePhoneticsPage(
  html: string,
  chapter: number,
): PhoneticsItem[] {
  return parseAudSections(html)
    .filter((s) => s.audioUrl)
    .map((s) => {
      const file = s.audioUrl!.split('/').pop()!;
      const id = file.replace(/\.mp3$/, '');

      const glosses = [...s.contentHtml.matchAll(OVERLIB_RE)]
        .map((m) => stripTags(m[1].replace(/\\'/g, "'")))
        .join(' · ');

      return {
        id,
        chapter,
        textDe: stripTags(s.contentHtml),
        textEn: glosses,
        caption: s.caption,
        audio: {
          sourceUrl: `https://media.la.utexas.edu/dib/audio/${file}`,
          key: `dib/audio/${file}`,
          kind: 'AUDIO' as const,
          license: DIB_LICENSE,
          attribution: DIB_ATTRIBUTION,
        },
      };
    });
}
