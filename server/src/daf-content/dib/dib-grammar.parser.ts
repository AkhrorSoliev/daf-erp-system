import type {
  AssetRef,
  DialogueLine,
  GapExercise,
  GrammarPage,
} from '../dataset.types';
import { GRAMMAR_LEVEL } from '../grammar-levels';
import { parseAudSections, stripTags } from './aud-section.parser';
import { DIB_LICENSE, DIB_ATTRIBUTION } from './dib-license';

const CODE_RE = /href="(?:\.\.\/gr\/)?([a-z]+_\d+)\.html"/g;
const TITLE_RE = /<title>([\s\S]*?)<\/title>/;
const DIALOGUE_ROW_RE =
  /<tr>\s*<td class="nowrap">([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g;
const EX_ROW_RE = /<td class="qnum">[\s\S]*?<\/td>\s*<td>([\s\S]*?)<\/td>/g;

/** Grimm Grammar mundarijasidagi sahifa kodlari. */
export function parseGrammarIndex(html: string): string[] {
  return [...new Set([...html.matchAll(CODE_RE)].map((m) => m[1]))];
}

/**
 * Bitta grammatika sahifasi, BOSMA versiyadan (`gg/pr/<code>.html`).
 *
 * Bosma versiya ataylab tanlangan: u interaktivdan ikki barobar kichik,
 * navigatsiya chrome'i yo'q, va mashq gaplari bo'sh joyni `<p class="txt_1">`
 * bilan aniq belgilab beradi (interaktivda u `<input>` bo'lib, atributlari
 * bilan aralashadi).
 */
export function parseGrammarPage(
  html: string,
  code: string,
): GrammarPage | null {
  const sections = parseAudSections(html);
  if (sections.length === 0) return null;

  const audio: AssetRef[] = sections
    .filter((s) => s.audioUrl)
    .map((s) => {
      const file = s.audioUrl!.split('/').pop()!;
      return {
        sourceUrl: `https://media.la.utexas.edu/gg/audio/${file}`,
        key: `dib/gg-audio/${file}`,
        kind: 'AUDIO' as const,
        license: DIB_LICENSE,
        attribution: DIB_ATTRIBUTION,
      };
    });

  const dialogue: DialogueLine[] = sections.flatMap((s) =>
    [...s.contentHtml.matchAll(DIALOGUE_ROW_RE)].map((m) => ({
      speaker: stripTags(m[1]),
      de: stripTags(m[2]),
      en: stripTags(m[3]),
    })),
  );

  const exBlock = sliceExerciseTable(html);
  const exercises: GapExercise[] = [...exBlock.matchAll(EX_ROW_RE)].map(
    (m, i) => ({
      id: `${code}_fib_${i + 1}`,
      sentenceDe: stripTags(m[1].replace(/<p class="txt_1"><\/p>/g, ' ___ ')),
      answer: null,
      answerStatus: 'MISSING' as const,
      grammarCode: code,
    }),
  );

  return {
    code,
    titleDe: titleOf(html),
    titleEn: code,
    level: GRAMMAR_LEVEL[code] ?? null,
    explanation: explanationOf(html),
    dialogue,
    audio,
    exercises,
  };
}

/** `<title>Grimm Grammar : haben : Haben</title>` → `Haben`. */
function titleOf(html: string): string {
  const m = html.match(TITLE_RE);
  if (!m) return '';
  const parts = stripTags(m[1]).split(':');
  return parts[parts.length - 1].trim();
}

/** Birinchi audio blokigacha bo'lgan matn — sahifaning tushuntirish qismi. */
function explanationOf(html: string): string {
  const cut = html.indexOf('<div id="fp_01"');
  const head = cut === -1 ? html : html.slice(0, cut);
  const body = head.replace(
    /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,
    '',
  );
  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => stripTags(m[1]))
    .filter((t) => t.length > 30);
  return paras.join(' ');
}

/** `Übung` bo'limidagi `<table class="ex">` ning ichi. */
function sliceExerciseTable(html: string): string {
  const start = html.indexOf('<table class="ex">');
  if (start === -1) return '';
  const end = html.indexOf('</table>', start);
  return html.slice(start, end === -1 ? html.length : end);
}
