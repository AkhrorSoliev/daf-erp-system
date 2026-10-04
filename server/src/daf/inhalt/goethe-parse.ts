/**
 * The Goethe-Institut A1 word list (Start Deutsch 1), read from
 * `pdftotext -tsv` output of the official PDF into `goethe-a1.json`.
 *
 * Only the list is taken: the FACT of which words are A1. The PDF's example
 * sentences are Goethe-Institut text, not ours, and are never copied.
 *
 * Source: https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf
 */

/**
 * One word of the list.
 *
 * - `wort`: as printed, without article or plural. One ending in `-` is a
 *   stem (`all-`, `dies-`, `Lieblings-`): every word starting with it counts.
 * - `artikel`: `der`, `die`, `das` or `der/die`; `null` when none is printed.
 * - `plural`: the printed ending (`-en`, `-¨e`, `(pl.)`); absent when none is.
 * - `gruppe`: the word groups (pp. 5–8) it is in, joined with `; `.
 * - `neben`: an indented entry, derived from the one above it; Goethe does
 *   not count these among its ~650 words.
 * - `varianten`: other spellings in the same entry (`gerne`, `z. B.`).
 * - `auch`: homographs that differ only in case (`essen` / `das Essen`).
 */
export interface GoetheEintrag {
  wort: string;
  artikel: string | null;
  plural?: string | null;
  gruppe?: string;
  neben?: true;
  varianten?: string[];
  auch?: string[];
}

/** `content/daf/a1/goethe-a1.json`: one entry per word, ignoring case. */
export interface GoetheFile {
  source: string;
  woerter: GoetheEintrag[];
}

/** The alphabetical list is printed on pp. 9–27 in two columns. */
const ERSTE_SEITE = 9;
const LETZTE_SEITE = 27;
/** The example column starts at x ≈ 236.5. */
const BEISPIEL_X = 232;

interface Zeile {
  head: string;
  ex: string;
  indent: boolean;
}

/**
 * Visual lines of the alphabetical list: the headword column, the example
 * column, and whether the headword is indented — its first word sits at
 * x ≈ 148, or pdftotext glued the indentation onto it as leading spaces.
 */
function zeilen(tsv: string): Zeile[] {
  const woerter = tsv
    .split('\n')
    .map((l) => l.split('\t'))
    .filter((r) => r[0] === '5') // level 5 = one word
    .map((r) => ({ p: +r[1], x: +r[6], y: +r[7], t: r[11] }))
    // header, footer and the left margin lie outside these bounds
    .filter(
      (w) =>
        w.p >= ERSTE_SEITE &&
        w.p <= LETZTE_SEITE &&
        w.y > 80 &&
        w.y < 790 &&
        w.x > 100,
    )
    .sort((a, b) => a.p - b.p || a.y - b.y || a.x - b.x);

  const lines: Array<{ p: number; y: number; ws: typeof woerter }> = [];
  for (const w of woerter) {
    const last = lines[lines.length - 1];
    if (last?.p === w.p && Math.abs(last.y - w.y) < 2) last.ws.push(w);
    else lines.push({ p: w.p, y: w.y, ws: [w] });
  }

  return lines.map(({ ws }) => {
    const head: string[] = [];
    const ex: string[] = [];
    let indent = false;
    for (const w of ws.sort((a, b) => a.x - b.x)) {
      if (w.x >= BEISPIEL_X) {
        ex.push(w.t.trim());
        continue;
      }
      if (head.length === 0 && (/^\s/.test(w.t) || w.x > 145)) indent = true;
      // "(pl.)  Die": one token that swallowed the first example word
      const [first, ...rest] = w.t.trim().split(/\s{2,}/);
      if (first) head.push(first);
      ex.unshift(...rest);
    }
    return {
      head: head.join(' '),
      ex: ex.filter(Boolean).join(' '),
      indent,
    };
  });
}

/** Headwords the general rule cannot split, as printed. */
const SPECIAL: Record<string, GoetheEintrag[]> = {
  'der, die, das': [
    { wort: 'der', artikel: null },
    { wort: 'die', artikel: null },
    { wort: 'das', artikel: null },
  ],
  'dort, -her, -hin': [
    { wort: 'dort', artikel: null },
    { wort: 'dorther', artikel: null },
    { wort: 'dorthin', artikel: null },
  ],
  'ihr/ihm/ihn': [
    { wort: 'ihr', artikel: null },
    { wort: 'ihm', artikel: null },
    { wort: 'ihn', artikel: null },
  ],
  'circa/ca.': [{ wort: 'circa', artikel: null, varianten: ['ca.'] }],
  'zum Beispiel/z. B.': [
    { wort: 'zum Beispiel', artikel: null, varianten: ['z. B.'] },
  ],
  'gern(e)': [{ wort: 'gern', artikel: null, varianten: ['gerne'] }],
  'Grad (Celsius)': [{ wort: 'Grad', artikel: null }],
  'der/die Bekannte, -n': [
    { wort: 'Bekannte', artikel: 'der/die', plural: '-n' },
  ],
  // Printed under "die Karte" without its own article; it is Karte's.
  '(Kredit)-Karte, -n': [{ wort: 'Kreditkarte', artikel: 'die', plural: '-n' }],
  // The PDF omits the article.
  'Satz, -ä, e': [{ wort: 'Satz', artikel: 'der', plural: '-¨e' }],
};

/**
 * One way to write a plural: the PDF prints an umlaut plural as "-ä, e",
 * "-Ä", "ä, er" or "-ö, er/-e" (here "-¨e", "-¨", "-¨er", "-¨er/-e"), and
 * a bare ending with "–" or "=".
 */
function normPlural(p: string | undefined): string | null {
  if (!p) return null;
  const s = p.replace(/[–=]/g, '-').replace(/\s+/g, ' ').trim();
  const u = /^-?\s*[äöüÄÖÜ](?:\s*,\s*([a-z]+))?(\/.*)?$/.exec(s);
  return u ? `-¨${u[1] ?? ''}${u[2] ?? ''}` : s;
}

/** "(sich) der Wort, plural" → entry; a special headword → its entries. */
function eintraege(raw: string): GoetheEintrag[] {
  if (SPECIAL[raw]) return SPECIAL[raw];
  let s = raw;
  let plural: string | null = null;
  if (s.includes('(pl.)')) {
    plural = '(pl.)';
    s = s.replace(/\s*\(pl\.\)/, '');
  }
  const m =
    /^(?:\(?sich\)?\s+)?(?:(der|die|das)\s+)?([^,]+?)(?:\s*,\s*(.*))?$/.exec(s);
  if (!m) throw new Error(`Goethe headword not understood: ${raw}`);
  plural ??= normPlural(m[3]);
  return [{ wort: m[2], artikel: m[1] ?? null, ...(plural ? { plural } : {}) }];
}

/** The alphabetical list (pp. 9–27) as printed, before `mergeGoethe`. */
export function parseGoetheTsv(tsv: string): GoetheEintrag[] {
  const raws: Array<{ raw: string; neben: boolean }> = [];
  for (const { head, ex, indent } of zeilen(tsv)) {
    // empty: an example line; one letter: the section header A, B, C …
    if (!head || /^[A-ZÄÖÜ]$/.test(head)) continue;
    let raw = head;
    // plural pushed into the example column: "die Sehenswürdigkeit," | "-en"
    const plural = /^-\S*/.exec(ex);
    if (raw.endsWith(',') && plural) raw += ` ${plural[0]}`;
    const prev = raws[raws.length - 1];
    // noun broken over two lines: "der Anruf-" + "beantworter"
    if (
      prev &&
      /^(der|die|das) \S+-$/.test(prev.raw) &&
      /^[a-zäöüß]/.test(raw)
    ) {
      prev.raw = prev.raw.slice(0, -1) + raw;
      continue;
    }
    let neben = indent;
    // pair over two lines, "die Hausfrau, -en/" + "der Hausmann": the
    // second half is as much a main entry as the first
    if (prev?.raw.endsWith('/')) {
      prev.raw = prev.raw.slice(0, -1);
      neben = prev.neben;
    }
    raws.push({ raw, neben });
  }
  return raws.flatMap(({ raw, neben }) =>
    eintraege(raw).map((e) => (neben ? { ...e, neben: true as const } : e)),
  );
}

const ohne = (...woerter: string[]): GoetheEintrag[] =>
  woerter.map((wort) => ({ wort, artikel: null }));
const der = (...woerter: string[]): GoetheEintrag[] =>
  woerter.map((wort) => ({ wort, artikel: 'der' }));

/**
 * The 13 word groups of pp. 6–8 (Wortgruppenliste), hand-transcribed.
 *
 * They are part of the A1 standard, but the PDF prints them apart from the
 * alphabetical list, as tables with several columns side by side, and a
 * reading line by line runs those columns together into one line. So these
 * groups are not extracted from the PDF but written here by hand, read off
 * the page. `daf:goethe-extract` still checks them: it stops when one of
 * these words is not printed on pp. 5–8.
 *
 * They hardly ever change (how many numbers, days and months there are is
 * fixed). If the PDF changes, re-read pp. 6–8 and edit this list by hand.
 *
 * Besides the 13 groups: the example row printed under «Länder/Ländernamen/
 * Nationalitäten», and the exam-task words p. 5 names as included.
 */
const GRUPPEN: Record<string, GoetheEintrag[]> = {
  Zahlen: [
    ...ohne(
      'eins',
      'zwei',
      'drei',
      'vier',
      'fünf',
      'sechs',
      'sieben',
      'acht',
      'neun',
      'zehn',
      'elf',
      'zwölf',
      'dreizehn',
      'vierzehn',
      'fünfzehn',
      'sechzehn',
      'siebzehn',
      'achtzehn',
      'neunzehn',
      'zwanzig',
      'einundzwanzig',
      'dreißig',
      'vierzig',
      'fünfzig',
      'sechzig',
      'siebzig',
      'achtzig',
      'neunzig',
    ),
    { wort: 'hundert', artikel: null, varianten: ['einhundert'] },
    ...ohne('hunderteins', 'zweihundert'),
    { wort: 'tausend', artikel: null, varianten: ['eintausend'] },
    { wort: 'Million', artikel: 'die', plural: '-en' },
    // The PDF prints "=en"; the plural is Milliarden.
    { wort: 'Milliarde', artikel: 'die', plural: '-n' },
    ...ohne('erste', 'zweite', 'dritte', 'vierte'),
  ],
  Datum: ohne('halb', 'Viertel'),
  Uhrzeit: ohne('null', 'Uhr', 'Viertel', 'halb', 'vor', 'nach'),
  'Zeitmaße, Zeitangaben': [
    { wort: 'Sekunde', artikel: 'die', plural: '-n' },
    { wort: 'Minute', artikel: 'die', plural: '-n' },
    { wort: 'Stunde', artikel: 'die', plural: '-n' },
    { wort: 'Tag', artikel: 'der', plural: '-e' },
    // The PDF prints "-e"; the plural is Wochen.
    { wort: 'Woche', artikel: 'die', plural: '-n' },
    { wort: 'Jahr', artikel: 'das', plural: '-e' },
  ],
  'Woche/Wochentage': [
    { wort: 'Wochentag', artikel: 'der', plural: '-e' },
    { wort: 'Wochenende', artikel: 'das' },
    ...der(
      'Sonntag',
      'Montag',
      'Dienstag',
      'Mittwoch',
      'Donnerstag',
      'Freitag',
      'Samstag',
      'Sonnabend',
    ),
  ],
  'Tag/Tageszeiten': [
    ...der('Tag', 'Morgen'),
    { wort: 'Vormittag', artikel: 'der', plural: '-e' },
    ...der('Mittag'),
    { wort: 'Nachmittag', artikel: 'der', plural: '-e' },
    { wort: 'Abend', artikel: 'der', plural: '-e' },
    { wort: 'Nacht', artikel: 'die', plural: '-¨e' },
  ],
  // "Monat" itself is printed only in this heading.
  'Monat/Monatsnamen': der(
    'Monat',
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ),
  'Jahr/Jahreszeiten': [
    { wort: 'Frühling', artikel: 'der' },
    { wort: 'Frühjahr', artikel: 'das' },
    ...der('Sommer', 'Herbst', 'Winter'),
  ],
  Währungen: ohne('Euro', 'Cent'),
  'Maße und Gewichte': [
    ...ohne(
      'Meter',
      'Zentimeter',
      'Kilometer',
      'Quadratmeter',
      'Grad',
      'unter',
      'Null',
      'minus',
      'über',
      'plus',
      'Prozent',
      'Liter',
      'Gramm',
      'Pfund',
    ),
    { wort: 'Kilo', artikel: null, varianten: ['Kilogramm'] },
  ],
  'Länder/Ländernamen/Nationalitäten': [
    ...ohne('Deutschland'),
    {
      wort: 'Deutsche',
      artikel: 'der/die',
      plural: '-n',
      varianten: ['Deutscher'],
    },
    ...ohne('deutsch', 'Europa', 'Europäer', 'europäisch'),
  ],
  // Printed as examples ("z. B.") of the row "Land, Bewohner, Nationalität".
  'Länder/Ländernamen/Nationalitäten (Beispiel)': [
    ...ohne('Türkei', 'Türke'),
    { wort: 'Türkin', artikel: null, plural: '-nen' },
    ...ohne('türkisch', 'Finnland', 'Finne'),
    { wort: 'Finnin', artikel: null, plural: '-nen' },
    ...ohne('finnisch', 'Mexiko', 'Mexikaner'),
    { wort: 'Mexikanerin', artikel: null, plural: '-nen' },
    ...ohne('mexikanisch'),
  ],
  Farben: ohne(
    'schwarz',
    'weiß',
    'grau',
    'rot',
    'blau',
    'gelb',
    'grün',
    'braun',
  ),
  Himmelsrichtungen: der('Norden', 'Süden', 'Westen', 'Osten'),
  // p. 5 names the words the exam tasks need as included: Antwortbogen,
  // Lösungen, ankreuzen, ergänzen, zuordnen. Lösung and ankreuzen are in the
  // alphabetical list; Antwortbogen only inside an example under "der Bogen".
  'Prüfungsaufgaben (S. 5)': [
    { wort: 'Antwortbogen', artikel: 'der' },
    ...ohne('ergänzen', 'zuordnen'),
  ],
};

/** The groups' words, each with its `gruppe`. */
export const GOETHE_GRUPPEN: GoetheEintrag[] = Object.entries(GRUPPEN).flatMap(
  ([gruppe, woerter]) => woerter.map((e) => ({ ...e, gruppe })),
);

/**
 * One entry per lowercase word, in first-seen order. The same word twice (in
 * the list and in a group, or in two groups) becomes one entry: groups join
 * with "; ", a missing article or plural is filled in, and a word that is a
 * main entry anywhere is a main entry. A homograph that differs only in case
 * (essen / das Essen, sie / Sie) is kept in `auch` of the first.
 */
export function mergeGoethe(eintraege: GoetheEintrag[]): GoetheEintrag[] {
  const byKey = new Map<string, GoetheEintrag>();
  for (const e of eintraege) {
    const key = e.wort.toLowerCase();
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, { ...e });
    } else if (cur.wort !== e.wort) {
      if (!cur.auch?.includes(e.wort)) cur.auch = [...(cur.auch ?? []), e.wort];
    } else {
      if (e.gruppe && !cur.gruppe?.split('; ').includes(e.gruppe)) {
        cur.gruppe = cur.gruppe ? `${cur.gruppe}; ${e.gruppe}` : e.gruppe;
      }
      if (!cur.artikel && e.artikel) cur.artikel = e.artikel;
      if (!cur.plural && e.plural) cur.plural = e.plural;
      if (cur.neben && !e.neben && !e.gruppe) delete cur.neben;
    }
  }
  // the same key order in every entry, empty fields left out
  return [...byKey.values()].map(
    ({ wort, artikel, plural, gruppe, neben, varianten, auch }) => ({
      wort,
      artikel,
      ...(plural ? { plural } : {}),
      ...(gruppe ? { gruppe } : {}),
      ...(neben ? { neben } : {}),
      ...(varianten ? { varianten } : {}),
      ...(auch ? { auch } : {}),
    }),
  );
}

/** Endings a lowercase stem entry takes: `dies-` → diese, diesem, diesen… */
const STAMM_ENDUNGEN = ['', 'e', 'em', 'en', 'er', 'es', 's'];

/**
 * Whether `wort` is built on a stem entry printed with a final `-`: a
 * lowercase stem only inflects (`dies-` → diesen, `meist-` → meisten, but
 * not Diesel), a capitalised one starts compounds (`Lieblings-` →
 * Lieblingsfilm).
 */
export function passtZumStamm(stamm: string, wort: string): boolean {
  const s = stamm.slice(0, -1).toLowerCase();
  const w = wort.toLowerCase();
  if (stamm[0] === stamm[0].toLowerCase()) {
    return STAMM_ENDUNGEN.some((e) => w === s + e);
  }
  return w.startsWith(s) && w.length > s.length;
}

/**
 * Whether `wort` is an A1 word: equal, ignoring case, to an entry's `wort`,
 * one of its `varianten` or `auch`, or built on a stem entry
 * (`passtZumStamm`).
 */
export function isWordInGoetheA1(wort: string, file: GoetheFile): boolean {
  const w = wort.toLowerCase();
  return file.woerter.some((e) =>
    [e.wort, ...(e.varianten ?? []), ...(e.auch ?? [])].some((form) =>
      form.endsWith('-') ? passtZumStamm(form, wort) : form.toLowerCase() === w,
    ),
  );
}
