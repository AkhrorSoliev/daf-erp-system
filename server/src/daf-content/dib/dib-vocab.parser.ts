import type { AssetRef, Lexeme, LexemeSection } from '../dataset.types';
import { decodeEntities } from './html-entities';
import { DIB_LICENSE, DIB_ATTRIBUTION } from './dib-license';

const AUDIO_RE = /voc_(\d{2})_(\d{2})_[A-Za-z0-9_-]+\.mp3/g;
const TITLE_RE = /class="hi_12_0057d1">([^<]*)</g;
const ROW_RE =
  /<tr[^>]*vtr_over[^>]*>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/g;

function clean(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Bitta bobning lug'at sahifasini bo'limlarga ajratadi.
 *
 * Sahifa tuzilishi (tekshirilgan): har bo'lim `voc_XX_YY_*.mp3` havolasi bilan
 * BOSHLANADI, undan keyin ikkita sarlavha spani (nemischa, inglizcha), keyin
 * `<td>` juftlari. Sahifaning yuqorisidagi navigatsiya ro'yxatida ham
 * sarlavha spani bor — u birinchi mp3 dan oldin turgani uchun kesiladi.
 */
export function parseVocabPage(html: string, chapter: number): LexemeSection[] {
  const marks = [...html.matchAll(AUDIO_RE)];
  if (marks.length === 0) return [];

  const sections: LexemeSection[] = [];

  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index ?? 0;
    const end =
      i + 1 < marks.length ? (marks[i + 1].index ?? html.length) : html.length;
    const chunk = html.slice(start, end);
    const file = marks[i][0];

    const titles = [...chunk.matchAll(TITLE_RE)].map((m) => clean(m[1]));
    const id = `dib-voc-${String(chapter).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;

    const audio: AssetRef = {
      sourceUrl: `https://media.la.utexas.edu/dib/audio/${file}`,
      key: `dib/audio/${file}`,
      kind: 'AUDIO',
      license: DIB_LICENSE,
      attribution: DIB_ATTRIBUTION,
    };

    const entries: Lexeme[] = [...chunk.matchAll(ROW_RE)]
      .map((m) => ({ de: clean(m[1]), en: clean(m[2]), sectionId: id }))
      .filter((e) => e.de !== '' && e.en !== '');

    sections.push({
      id,
      chapter,
      titleDe: titles[0] ?? '',
      titleEn: titles[1] ?? '',
      audio,
      entries,
    });
  }

  return sections;
}
