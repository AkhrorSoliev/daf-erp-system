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
const TABLE_ROW_RE = /<tr>([\s\S]*?)<\/tr>/g;
const TABLE_CELL_RE = /<td[^>]*>([\s\S]*?)<\/td>/g;
const QNUM_ROW_RE = /^\s*<td class="qnum">/;
const CLOZE_BLANK_RE = /<p class="txt_1"><\/p>/g;
const WB_TABLE_RE = /<table class="wb">([\s\S]*?)<\/table>/;
const WB_CELL_RE = /<td([^>]*)>([\s\S]*?)<\/td>/g;
// Bosh sahifa tepasidagi «Toifa:Sarlavha» yo'l belgisi shu span bilan
// belgilanadi — HAR TO'RTALA fixture'da bir xil, uzunligi esa har xil
// (ba'zida 30 belgidan uzun bo'lib, tushuntirishga sizib kirardi).
const CATEGORY_MARKER = 'h_16_8a97b2';

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

  return {
    code,
    titleDe: titleOf(html),
    titleEn: code,
    level: GRAMMAR_LEVEL[code] ?? null,
    explanation: explanationOf(html),
    dialogue,
    audio,
    exercises: exercisesOf(html, code),
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
    // «Toifa:Sarlavha» yo'l belgisi tushuntirish EMAS — sarlavha `<title>`
    // orqali allaqachon olingan. Uzunlik bo'yicha emas, aynan shu belgi
    // orqali chetlatiladi: ba'zi sahifalarda (masalan `vsub_02`) bu qator
    // 30 belgidan uzun bo'lib, eski uzunlik filtridan sizib o'tardi.
    .filter((m) => !m[1].includes(CATEGORY_MARKER))
    .map((m) => stripTags(m[1]))
    .filter((t) => t.length > 0);
  return paras.join(' ');
}

/**
 * Sahifadagi mashqlar. Manbada UCH XIL format bor va bittasi ikkinchisini
 * istisno qiladi — bitta sahifa faqat bittasini ishlatadi:
 *
 * 1. Qator jadvali (`<table class="ex">`) — har SPAN'da GAP yoki REORDER.
 * 2. Cloze parcha (`<p class="clz">`) — bitta ko'p bo'sh joyli matn.
 * 3. Hech biri — sahifada haqiqatan ham Übung yo'q (bo'sh ro'yxat qonuniy).
 */
function exercisesOf(html: string, code: string): GapExercise[] {
  const exBlock = sliceExerciseTable(html);
  if (exBlock) {
    return exerciseSpans(exBlock)
      .map((rows) => spanExercise(rows, code))
      .filter((e): e is Omit<GapExercise, 'id'> => e !== null)
      .map((e, i) => ({ ...e, id: `${code}_fib_${i + 1}` }));
  }

  const cloze = sliceCloze(html);
  if (cloze !== null) {
    return [clozeExercise(cloze, html, code)];
  }

  return [];
}

/**
 * Jadvaldagi qatorlarni mashq SPAN'lariga guruhlaydi: har span raqamlangan
 * (`qnum`) qatordan boshlanib, navbatdagi `qnum` qatorigacha davom etadi.
 * Ko'pchilik sahifada span bitta qatordan iborat, lekin `cas_06` kabi
 * dialogli formatda bitta savol bir necha qatorga (davomi + bo'sh joy) taqsimlangan
 * — bo'sh joy `qnum`siz davom qatorida keladi. Ajratuvchi bo'sh qator
 * (`line-height: .5em`) hech qanday span'ga tegishli emas, u shunchaki
 * keyingi span boshlanmaguncha oxirgi span'ga qo'shilib, keyin bo'sh matn
 * sifatida yo'qoladi.
 */
function exerciseSpans(exBlock: string): string[][] {
  const rows = [...exBlock.matchAll(TABLE_ROW_RE)].map((m) => m[1]);
  const spans: string[][] = [];
  let current: string[] | null = null;

  for (const row of rows) {
    if (QNUM_ROW_RE.test(row)) {
      if (current) spans.push(current);
      current = [row];
    } else if (current) {
      current.push(row);
    }
  }
  if (current) spans.push(current);

  return spans;
}

/**
 * Bitta mashq span'i — bir yoki bir necha qator. `qnum` katagi (span'ning
 * eng birinchi katagi) tashlab yuboriladi, qolgan barcha kataklar o'qish
 * tartibida bo'shliq bilan birlashtiriladi, shunda so'zlar tutashib
 * ketmaydi. Natijada `class="txt_1"` bor bo'lsa — GAP (bo'sh joy). Bo'lmasa
 * — REORDER: `<i>So'zlovchi:</i> token / token / ...<br><input class="txt_2">`
 * shaklida, tokenlar `/` bilan ajratilgan. Ikkalasi ham topilmasa (masalan
 * yolg'iz so'zlovchi nomi, davom matni boshqa katakda), span mashq
 * tarkibiga ega emas va o'tkazib yuboriladi.
 */
function spanExercise(
  rows: string[],
  code: string,
): Omit<GapExercise, 'id'> | null {
  const cells = rows.flatMap((row) =>
    [...row.matchAll(TABLE_CELL_RE)].map((m) => m[1]),
  );
  const cellHtml = cells.slice(1).join(' ');

  if (cellHtml.includes('class="txt_1"')) {
    return {
      kind: 'GAP',
      sentenceDe: stripTags(cellHtml.replace(CLOZE_BLANK_RE, ' ___ ')),
      answer: null,
      answerStatus: 'MISSING',
      grammarCode: code,
    };
  }

  // So'zlovchi prefiksi (`<i>Der Esel:</i>`) topshiriq matnining bir qismi,
  // token EMAS — shuning uchun tokenlarni ajratishdan oldin olib tashlanadi.
  const promptHtml = cellHtml.split(/<br\s*\/?>/i)[0];
  const tokenHtml = promptHtml.replace(/<i>[\s\S]*?<\/i>\s*/, '');
  const tokens = tokenHtml
    .split('/')
    .map((t) => stripTags(t).trim())
    .filter(Boolean);

  if (tokens.length === 0) return null;

  return {
    kind: 'REORDER',
    sentenceDe: stripTags(promptHtml),
    tokens,
    answer: null,
    answerStatus: 'MISSING',
    grammarCode: code,
  };
}

/**
 * Cloze mashqi bitta yaxlit yozuv sifatida qaytadi — 11 ta bo'sh joy bitta
 * kontekstni bo'lishadi, ularni alohida-alohida mashqqa bo'lish javob
 * berishga imkon beruvchi kontekstni yo'qotardi.
 */
function clozeExercise(
  clozeHtml: string,
  fullHtml: string,
  code: string,
): GapExercise {
  const blankCount = [...clozeHtml.matchAll(CLOZE_BLANK_RE)].length;
  const sentenceDe = stripTags(clozeHtml.replace(CLOZE_BLANK_RE, ' ___ '));
  const wordBank = wordBankOf(fullHtml);

  return {
    id: `${code}_fib_1`,
    kind: 'CLOZE',
    sentenceDe,
    blankCount,
    ...(wordBank.length > 0 ? { wordBank } : {}),
    answer: null,
    answerStatus: 'MISSING',
    grammarCode: code,
  };
}

/** `Übung` bo'limidagi `<table class="ex">` ning ichi. Topilmasa — bo'sh. */
function sliceExerciseTable(html: string): string {
  const start = html.indexOf('<table class="ex">');
  if (start === -1) return '';
  const end = html.indexOf('</table>', start);
  return html.slice(start, end === -1 ? html.length : end);
}

/**
 * `<p class="clz">` ning ichi. Manba HTML'i bu paragrafni yopmaydi
 * (`</p>` teg yo'q) — matn uni o'rab turgan `indent_wrap_250` divi
 * yopilguncha davom etadi. Topilmasa — `null` (sahifada cloze yo'q).
 */
function sliceCloze(html: string): string | null {
  const marker = '<p class="clz">';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const contentStart = start + marker.length;
  const end = html.indexOf('</div>', contentStart);
  return html.slice(contentStart, end === -1 ? html.length : end);
}

/** `<table class="wb">` dagi so'z banki — sarlavha qatori (`ti_wb`) chetlatiladi. */
function wordBankOf(html: string): string[] {
  const table = html.match(WB_TABLE_RE);
  if (!table) return [];
  return [...table[1].matchAll(WB_CELL_RE)]
    .filter(([, attrs]) => !attrs.includes('ti_wb'))
    .map(([, , content]) => stripTags(content))
    .filter(Boolean);
}
