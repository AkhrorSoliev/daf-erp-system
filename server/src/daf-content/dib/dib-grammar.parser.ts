import type {
  AssetRef,
  DialogueLine,
  GapExercise,
  GrammarPage,
} from '../dataset.types';
import { GRAMMAR_LEVEL } from '../grammar-levels';
import { parseAudSections, stripTags } from './aud-section.parser';
import { parseExerciseSets } from './dib-exercise-set.parser';
import { DIB_LICENSE, DIB_ATTRIBUTION } from './dib-license';

const CODE_RE = /href="(?:\.\.\/gr\/)?([a-z]+_\d+)\.html"/g;
const TITLE_RE = /<title>([\s\S]*?)<\/title>/;
const DIALOGUE_ROW_RE =
  /<tr>\s*<td class="nowrap">([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g;
const TABLE_CELL_RE = /<td[^>]*>([\s\S]*?)<\/td>/g;
const QNUM_ROW_RE = /^\s*<td class="qnum">/;
// Beshinchi mashq formati (MC) qatorlari `qnum` klassisiz, yalang'och
// `<td><b>N.</b></td>` bilan raqamlanadi — span shu qatordan ham ochiladi.
const BARE_NUM_ROW_RE = /^\s*<td><b>\d+\.?<\/b>\.?<\/td>/;
const MC_VERT_OPEN = '<table class="mc_vert">';
const CLOZE_BLANK_RE = /<p class="txt_1"[^>]*><\/p>/g;
/**
 * Interaktiv sahifadagi bo'sh joy: `<input name="fib_7" class="txt_1">`.
 *
 * FAQAT `txt_1`. `txt_2` — REORDER'ning javob qatori, ya'ni gap ichidagi
 * bo'sh joy emas, butun javob uchun bitta chiziq. Uni ham bo'sh joyga
 * aylantirish REORDER'ni GAP deb ko'rsatib yuboradi (tur `txt_1` borligi
 * bilan aniqlanadi) va 10 ta tartiblash mashqi yo'qoladi.
 */
const INPUT_BLANK_RE = /<input\b[^>]*class="txt_1"[^>]*>/gi;
const INPUT_NAME_RE = /name="(?:fib|mc)_(\d+)"/i;
/** Bo'sh joyning manbadagi tartib raqami — javob kalitiga kalit. */
const SLOT_ATTR_RE = /<p class="txt_1" data-slot="(\d+)"><\/p>/g;
/** REORDER javob qatori — butun mashqqa bitta o'rin. */
const REORDER_SLOT_RE = /<input\b[^>]*name="fib_(\d+)"[^>]*class="txt_2"[^>]*>/i;
const MC_SLOT_RE = /name="mc_(\d+)"/i;

/**
 * Interaktiv sahifani bosma sahifa shakliga keltiradi — LEKIN bo'sh
 * joyning raqamini saqlab qoladi.
 *
 * Bosma versiyada bo'sh joy `<p class="txt_1"></p>`, ya'ni ANONIM. Shuning
 * uchun javoblarni faqat tartib bo'yicha biriktirish mumkin edi, va bitta
 * xato siljish butun to'plamning javoblarini buzardi. Interaktiv versiyada
 * esa har bo'sh joy o'z raqami bilan keladi (`name="fib_7"`) va o'sha raqam
 * javob kalitidagi o'rinni bevosita ko'rsatadi.
 */
function normalizeBlanks(html: string): string {
  return html.replace(INPUT_BLANK_RE, (tag) => {
    const n = INPUT_NAME_RE.exec(tag)?.[1];
    return n ? `<p class="txt_1" data-slot="${n}"></p>` : '<p class="txt_1"></p>';
  });
}

/** Mashqning javob kalitidagi o'rinlari, hujjat tartibida. */
function slotsOf(spanHtml: string): number[] {
  const blanks = [...spanHtml.matchAll(SLOT_ATTR_RE)].map((m) => Number(m[1]));
  if (blanks.length > 0) return blanks;

  const reorder = REORDER_SLOT_RE.exec(spanHtml);
  if (reorder) return [Number(reorder[1])];

  const mc = MC_SLOT_RE.exec(spanHtml);
  return mc ? [Number(mc[1])] : [];
}

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
 *
 * `skipStats` ixtiyoriy — berilsa, REORDER'ga aylanolmagan (ikkitadan kam
 * tokenli) span'lar soni shu ob'ektga qo'shib boriladi. Yig'uvchi skript
 * (`daf-harvest.ts`) buni 92 sahifa bo'ylab yig'ib, hisobotda ko'rsatadi —
 * yo'qotish jim qolmasligi uchun.
 */
export function parseGrammarPage(
  html: string,
  code: string,
  skipStats?: SkipStats,
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

  const { titleDe, titleEn } = titlesOf(html, code);

  return {
    code,
    titleDe,
    titleEn,
    level: GRAMMAR_LEVEL[code] ?? null,
    explanation: explanationOf(html),
    dialogue,
    audio,
    exercises: exercisesOf(html, code, skipStats),
  };
}

/**
 * `<title>Grimm Grammar : haben : Haben</title>` uch qismdan iborat: manba
 * bo'limi (doim «Grimm Grammar»), inglizcha nom va nemischa sarlavha.
 * `titleDe` OXIRGI qismni oladi (ba'zi nemischa sarlavhalarning o'zida
 * ikkinchi ikki nuqta bor, masalan «Das Passiv: Alternative zum Passiv» —
 * bu holat alohida muammo, shu funksiya doirasida hal qilinmaydi).
 * `titleEn` — O'RTADAGI qism, aynan shu joyda edi va oldin butunlay
 * tashlab yuborilib, `code` bilan almashtirilardi. Sarlavha uch qismdan kam
 * bo'lsa (masalan mundarija sahifasi), inglizcha nomga o'rin yo'q — `code`ga
 * qaytiladi.
 */
function titlesOf(
  html: string,
  code: string,
): { titleDe: string; titleEn: string } {
  const m = html.match(TITLE_RE);
  if (!m) return { titleDe: '', titleEn: code };
  const parts = stripTags(m[1])
    .split(':')
    .map((p) => p.trim());
  const titleDe = parts[parts.length - 1];
  const titleEn = parts.length >= 3 ? parts[1] : code;
  return { titleDe, titleEn };
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

/** `exercisesOf` ichida REORDER'ga aylanolmay o'tkazib yuborilgan span'lar soni. */
export interface SkipStats {
  skipped: number;
}

/**
 * Sahifadagi mashqlar. Manbada TO'RT XIL format bor, va ular bir-birini
 * ISTISNO QILMAYDI — bitta sahifada ikkalasi ham bo'lishi mumkin
 * (masalan `cas_03`, `vcp_02`: qator jadvali VA cloze parcha bir sahifada):
 *
 * 1. Qator jadvali (`<table class="ex">`) — har SPAN'da GAP, REORDER yoki MC.
 * 2. Cloze parcha (`<p class="clz">`) — bitta ko'p bo'sh joyli matn.
 * 3. Hech biri — sahifada haqiqatan ham Übung yo'q (bo'sh ro'yxat qonuniy).
 *
 * Eski kod cloze tekshiruvini FAQAT jadval topilmasa bajarardi (`if/return`),
 * shuning uchun jadvali VA clozesi bor sahifada cloze hech qachon
 * ko'rinmasdi — `vcp_02` (13 bo'sh joy) va `cas_03` (15 bo'sh joy) shunday
 * butunlay yo'qolgan edi. Endi ikkala manba HAR DOIM o'qiladi va
 * birlashtiriladi; id'lar shu birlashgan ro'yxat bo'yicha ketma-ket
 * raqamlanadi.
 *
 * Sahifadagi BARCHA `<table class="ex">` bloklari o'qiladi (faqat birinchisi
 * emas).
 */
/**
 * Mashqlar TO'PLAM bo'yicha o'qiladi, sahifa bo'yicha emas.
 *
 * Avval butun sahifadagi `<table class="ex">` bloklari bir qopga
 * yig'ilardi. Bu ikki narsani yo'qotdi: qaysi mashq qaysi to'plamga
 * tegishli ekani (javob kalitini biriktirib bo'lmaydi), va manba e'lon
 * qilgan savollar soni bilan solishtirish imkoni (256 ta mashq shuning
 * uchun jimgina yo'qolgan edi).
 *
 * Har mashq o'z to'plamining kodini olib yuradi. `id` ham to'plam ichida
 * raqamlanadi, sahifa bo'ylab emas — shunda bitta to'plamning o'zgarishi
 * qo'shni to'plamning identifikatorlarini surib yubormaydi.
 */
function exercisesOf(
  html: string,
  code: string,
  skipStats?: SkipStats,
): GapExercise[] {
  return parseExerciseSets(html).flatMap((set): GapExercise[] => {
    const setHtml = normalizeBlanks(set.html);

    type Parsed = Omit<GapExercise, 'id' | 'setCode'>;
    const fromTables: Parsed[] = [];
    for (const block of sliceExerciseTables(setHtml)) {
      for (const rows of exerciseSpans(block)) {
        const e = spanExercise(rows, code, skipStats);
        if (e !== null) fromTables.push({ ...e, slots: slotsOf(rows.join('')) });
      }
    }

    const cloze = sliceCloze(setHtml);
    const all: Parsed[] =
      cloze !== null
        ? [
            ...fromTables,
            { ...clozeExercise(cloze, setHtml, code), slots: slotsOf(cloze) },
          ]
        : fromTables;

    return all.map((e, i) => ({
      ...e,
      id: `${set.code}_${i + 1}`,
      setCode: set.code,
    }));
  });
}


/**
 * Jadvaldagi qatorlarni mashq SPAN'lariga guruhlaydi: har span raqamlangan
 * qatordan boshlanib, navbatdagi raqamlangan qatorigacha davom etadi.
 * Raqamlash yo `qnum` klassli katak bilan, yo (MC formatida) klasssiz
 * yalang'och `<td><b>N.</b></td>` katagi bilan keladi — ikkalasi ham span
 * ochadi. Ko'pchilik sahifada span bitta qatordan iborat, lekin `cas_06`
 * kabi dialogli formatda bitta savol bir necha qatorga (davomi + bo'sh joy)
 * taqsimlangan — bo'sh joy raqamsiz davom qatorida keladi. Ajratuvchi bo'sh
 * qator (`line-height: .5em`) hech qanday span'ga tegishli emas, u shunchaki
 * keyingi span boshlanmaguncha oxirgi span'ga qo'shilib, keyin bo'sh matn
 * sifatida yo'qoladi.
 */
function exerciseSpans(exBlock: string): string[][] {
  const rows = splitTopLevelRows(exBlock);
  const spans: string[][] = [];
  let current: string[] | null = null;

  for (const row of rows) {
    if (QNUM_ROW_RE.test(row) || BARE_NUM_ROW_RE.test(row)) {
      if (current) spans.push(current);
      current = [row];
    } else if (current) {
      current.push(row);
    }
  }
  if (current) spans.push(current);

  return spans;
}

/** `sentenceDe` ichidagi `___` bo'sh joylar soni — GAP, MC va CLOZE uchun umumiy. */
function blankCountOf(sentenceDe: string): number {
  return (sentenceDe.match(/___/g) ?? []).length;
}

/**
 * Bitta mashq span'i — bir yoki bir necha qator. Avval MC tekshiriladi:
 * ichma-ich `<table class="mc_vert">` bo'lsa, oddiy katak-bo'yicha ajratish
 * (`TABLE_CELL_RE`) savol matnini variantlar bilan chalkashtirib yuboradi
 * (ichki jadvalning o'z `<td>`lari bor), shuning uchun MC alohida, chuqurlikni
 * hisobga oluvchi yo'l bilan ishlanadi (`mcExercise`).
 *
 * Qolgan hollarda: `qnum`/raqamlash katagi (span'ning eng birinchi katagi)
 * tashlab yuboriladi, qolgan barcha kataklar o'qish tartibida bo'shliq bilan
 * birlashtiriladi, shunda so'zlar tutashib ketmaydi. Natijada
 * `class="txt_1"` bor bo'lsa — GAP (bo'sh joy). Bo'lmasa — REORDER:
 * `<i>So'zlovchi:</i> token / token / ...<br><input class="txt_2">`
 * shaklida, tokenlar `/` bilan ajratilgan.
 *
 * Tokenlarga ajratishdan OLDIN teglar tozalanishi shart: `/` bilan avval
 * bo'lib, keyin `stripTags` chaqirilsa, yopilish tegining o'zidagi `/`
 * (`</span>`) ham ajratgich deb hisoblanib, tegni ikkiga bo'lib yuboradi
 * (`vpass_04`da aynan shu — natija tokenlarda xom `<`/`span>` qoldig'i bilan
 * chiqqan edi). Endi butun span avval tozalanadi, `/` shundan keyin
 * qidiriladi — teg ichidagi `/` allaqachon yo'q bo'ladi.
 *
 * Ikkitadan kam tokenli natija (masalan yolg'iz so'zlovchi nomi, yoki
 * gapni birlashtirish topshirig'i — bitta "token" ichida ikkita to'liq gap)
 * REORDER emas: tartiblanadigan hech narsa yo'q. Bunday span o'tkazib
 * yuboriladi, `skipStats` bo'lsa hisoblanadi.
 */
function spanExercise(
  rows: string[],
  code: string,
  skipStats?: SkipStats,
): Omit<GapExercise, 'id' | 'setCode' | 'slots'> | null {
  const rawSpan = rows.join(' ');
  if (rawSpan.includes(MC_VERT_OPEN)) {
    return mcExercise(rawSpan, code);
  }

  const cells = rows.flatMap((row) =>
    [...row.matchAll(TABLE_CELL_RE)].map((m) => m[1]),
  );
  const cellHtml = cells.slice(1).join(' ');

  if (cellHtml.includes('class="txt_1"')) {
    const sentenceDe = stripTags(cellHtml.replace(CLOZE_BLANK_RE, ' ___ '));
    return {
      kind: 'GAP',
      sentenceDe,
      blankCount: blankCountOf(sentenceDe),
      answers: null,
      answerStatus: 'MISSING',
      grammarCode: code,
    };
  }

  // So'zlovchi prefiksi (`<i>Der Esel:</i>`) topshiriq matnining bir qismi,
  // token EMAS — shuning uchun tokenlarni ajratishdan oldin olib tashlanadi.
  const promptHtml = cellHtml.split(/<br\s*\/?>/i)[0];
  const tokenHtml = promptHtml.replace(/<i>[\s\S]*?<\/i>\s*/, '');
  const tokens = stripTags(tokenHtml)
    .split('/')
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length < 2) {
    if (skipStats) skipStats.skipped++;
    return null;
  }

  return {
    kind: 'REORDER',
    sentenceDe: stripTags(promptHtml),
    tokens,
    answers: null,
    answerStatus: 'MISSING',
    grammarCode: code,
  };
}

/**
 * MC (ko'p variantli) mashqi. Bo'sh joy `txt_1` emas, chiziqchalar ketma-
 * ketligi (masalan `________`) bilan belgilanadi, variantlar esa ichma-ich
 * `<table class="mc_vert">` radio jadvalida keladi (har qatorda bitta
 * variant, masalan `a. weil`). Avval raqamlash katagi olib tashlanadi (uning
 * ichida jadval yo'q, shuning uchun lazy regex xavfsiz), so'ng `mc_vert`
 * bloki `findMatchingTableClose` bilan — ICHIDAGI hech qanday yana ichma-ich
 * jadval bo'lmasa ham — chuqurlikni hisobga olib kesib olinadi, qolgani
 * savol matni bo'ladi.
 */
function mcExercise(
  rawSpan: string,
  code: string,
): Omit<GapExercise, 'id' | 'setCode' | 'slots'> | null {
  const withoutNumberCell = rawSpan.replace(
    /^\s*<td[^>]*>[\s\S]*?<\/td>\s*/,
    '',
  );

  const mcStart = withoutNumberCell.indexOf(MC_VERT_OPEN);
  if (mcStart === -1) return null;

  const mcContentStart = mcStart + MC_VERT_OPEN.length;
  const mcEnd = findMatchingTableClose(withoutNumberCell, mcContentStart);
  const mcInner =
    mcEnd === -1
      ? withoutNumberCell.slice(mcContentStart)
      : withoutNumberCell.slice(mcContentStart, mcEnd);

  const questionHtml = withoutNumberCell.slice(0, mcStart);
  const sentenceDe = stripTags(questionHtml.replace(/_{2,}/g, ' ___ '));

  const options = [...mcInner.matchAll(TABLE_CELL_RE)]
    .map((m) => stripTags(m[1]))
    .filter(Boolean);

  // Bo'sh joy TALAB QILINMAYDI. Manbada MC ikki xil keladi: gapda `___`
  // bo'lgani («Wir haben ___ statt eines Königs»), va butun gap berilib
  // to'g'ri o'zgartirish tanlanadigani («Zuerst holt der Mann… → a. Zuerst
  // wird… geholt»). Ikkinchisi ham haqiqiy Goethe formati. `___` ni shart
  // qilib qo'ygan versiya 9 sahifadagi 100 ta MC'ni jimgina tashlab
  // yuborardi, va 6 sahifa butunlay mashqsiz qolardi.
  if (!sentenceDe || options.length < 2) return null;

  return {
    kind: 'MC',
    sentenceDe,
    blankCount: blankCountOf(sentenceDe),
    options,
    answers: null,
    answerStatus: 'MISSING',
    grammarCode: code,
  };
}

/**
 * `exBlock` ichidagi ENG YUQORI DARAJADAGI `<tr>...</tr>` qatorlari. Oddiy
 * `/<tr>([\s\S]*?)<\/tr>/g` MC qatorlarida ishlamaydi: ichma-ich
 * `<table class="mc_vert">` o'zining `<tr>`larini olib keladi, lazy regex
 * esa ularni tashqi qatordan alohida "qator" deb noto'g'ri ajratib yuboradi.
 * Shuning uchun `<table>`/`</table>` chuqurligi sanaladi va faqat chuqurlik
 * 0 bo'lganda ochilgan/yopilgan `<tr>` haqiqiy qator chegarasi deb olinadi —
 * ichma-ich jadval qatorlari tashqi qatorning XOM MATNI sifatida qoladi va
 * keyinroq `mcExercise` tomonidan alohida ochiladi.
 */
function splitTopLevelRows(exBlock: string): string[] {
  const TAG_RE = /<table\b[^>]*>|<\/table>|<tr\b[^>]*>|<\/tr>/gi;
  const rows: string[] = [];
  // `exBlock`ning o'zi `<table class="ex">` ochilish tegidan boshlanadi
  // (`sliceExerciseTables` uni kesib tashlamaydi) — shuning uchun chuqurlik
  // `-1`dan boshlanadi: o'sha teg ko'rilgach 0'ga chiqadi, ya'ni "ex jadvali
  // ichida, hech qanday ichma-ich jadval ochiq emas" holatini bildiradi.
  let tableDepth = -1;
  let rowStart = -1;
  let m: RegExpExecArray | null;

  while ((m = TAG_RE.exec(exBlock))) {
    const tag = m[0].toLowerCase();
    if (tag.startsWith('<table')) {
      tableDepth++;
    } else if (tag === '</table>') {
      tableDepth = Math.max(0, tableDepth - 1);
    } else if (tableDepth === 0 && tag.startsWith('<tr')) {
      rowStart = m.index + m[0].length;
    } else if (tableDepth === 0 && tag === '</tr>' && rowStart !== -1) {
      rows.push(exBlock.slice(rowStart, m.index));
      rowStart = -1;
    }
  }

  return rows;
}

/**
 * Cloze mashqi bitta yaxlit yozuv sifatida qaytadi — 11 ta bo'sh joy bitta
 * kontekstni bo'lishadi, ularni alohida-alohida mashqqa bo'lish javob
 * berishga imkon beruvchi kontekstni yo'qotardi.
 *
 * `id` bu yerda BERILMAYDI — `exercisesOf` jadval mashqlari bilan
 * birlashtirilgandan keyin, YAGONA joyda ketma-ket raqamlaydi.
 */
function clozeExercise(
  clozeHtml: string,
  fullHtml: string,
  code: string,
): Omit<GapExercise, 'id' | 'setCode' | 'slots'> {
  const sentenceDe = stripTags(clozeHtml.replace(CLOZE_BLANK_RE, ' ___ '));
  const wordBank = wordBankOf(fullHtml);

  return {
    kind: 'CLOZE',
    sentenceDe,
    blankCount: blankCountOf(sentenceDe),
    ...(wordBank.length > 0 ? { wordBank } : {}),
    answers: null,
    answerStatus: 'MISSING',
    grammarCode: code,
  };
}

/**
 * Sahifadagi HAR BIR `Übung` bloki — `<table class="ex">` ning ichi,
 * paydo bo'lish tartibida. Ba'zi sahifalarda (masalan `con_04`, `vsub_02`,
 * `cas_07`) bir nechta blok bor — eski kod faqat BIRINCHISINI olardi
 * (bitta `indexOf`), ikkinchisi butunlay yo'qolardi. Blok chegarasi oddiy
 * `indexOf('</table>')` bilan emas, `findMatchingTableClose` bilan
 * topiladi: MC bloklarida ichma-ich `<table class="mc_vert">` bo'lgani
 * uchun oddiy qidiruv birinchi ichki jadval tugashi bilan bloqni vaqtidan
 * oldin kesib qo'yardi.
 */
function sliceExerciseTables(html: string): string[] {
  const OPEN = '<table class="ex">';
  const blocks: string[] = [];
  let from = 0;

  while (true) {
    const start = html.indexOf(OPEN, from);
    if (start === -1) break;
    const contentStart = start + OPEN.length;
    const end = findMatchingTableClose(html, contentStart);
    blocks.push(html.slice(start, end === -1 ? html.length : end));
    from = end === -1 ? html.length : end + '</table>'.length;
  }

  return blocks;
}

/**
 * `from` pozitsiyasidan boshlab, ichma-ich `<table>` chuqurligini hisobga
 * olib, ochiq jadvalning HAQIQIY yopilish `</table>` tegining indeksini
 * qaytaradi (`from` — bitta ochiq jadval ichida turibdi deb hisoblanadi,
 * ya'ni boshlang'ich chuqurlik 1). Topilmasa `-1`.
 */
function findMatchingTableClose(html: string, from: number): number {
  const TAG_RE = /<table\b[^>]*>|<\/table>/gi;
  TAG_RE.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;

  while ((m = TAG_RE.exec(html))) {
    if (m[0].toLowerCase() === '</table>') {
      depth--;
      if (depth === 0) return m.index;
    } else {
      depth++;
    }
  }

  return -1;
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
