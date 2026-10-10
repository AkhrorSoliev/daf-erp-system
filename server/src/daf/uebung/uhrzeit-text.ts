/**
 * The German words for a clock time — the ONE place they are made.
 *
 * The clock exercises (`uhr-fragen.ts`), answer checking and the audio
 * script all read these functions; no time is written by hand anywhere,
 * so «halb vier» can never be stored as 4:30 in one file and 3:30 in
 * another.
 *
 * Two ways of telling time are taught (unit 5, «Wie spät ist es?»):
 * informal on the 12-hour clock («Viertel nach drei», «halb vier»), and
 * official with «Uhr» («drei Uhr dreißig», «fünfzehn Uhr dreißig»). An
 * analogue clock shows no a.m./p.m., so for a clock face both 3:30 and
 * 15:30 are correct (`uhrAntworten`).
 *
 * Informal forms exist for five-minute steps only — the steps A1 teaches.
 * A minute between them throws instead of guessing a phrase.
 */

const EINER = [
  'null',
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
];
const ZEHNER: Record<number, string> = {
  2: 'zwanzig',
  3: 'dreißig',
  4: 'vierzig',
  5: 'fünfzig',
};

/** 0–59 as a German word: «einundzwanzig», «dreißig». */
export function zahlwort(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 59) {
    throw new Error(`zahlwort: 0–59 kutilgan, keldi ${n}`);
  }
  if (n < 20) return EINER[n];
  const zehner = ZEHNER[Math.floor(n / 10)];
  const einer = n % 10;
  if (einer === 0) return zehner;
  return `${einer === 1 ? 'ein' : EINER[einer]}und${zehner}`;
}

/** The hour before «Uhr»: «ein Uhr», never «eins Uhr». */
function stundeVorUhr(h: number): string {
  return h === 1 ? 'ein' : zahlwort(h);
}

export interface Zeit {
  h: number;
  m: number;
}

/** Strict `HH:MM`, 00:00–23:59; anything else is `null`. */
export function parseZeit(s: string): Zeit | null {
  const treffer = /^(\d{2}):(\d{2})$/.exec(s);
  if (!treffer) return null;
  const h = Number(treffer[1]);
  const m = Number(treffer[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/** The hour as the clock face shows it: 1–12. */
function zwoelfer(h: number): number {
  return h % 12 === 0 ? 12 : h % 12;
}

/** The clock face time, hours 1–12: `03:30` for 3:30 and 15:30 alike. */
export function kanonisch(h: number, m: number): string {
  return `${String(zwoelfer(h)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Two times look the same on an analogue clock. */
export function gleicheUhr(a: Zeit, b: Zeit): boolean {
  return a.m === b.m && zwoelfer(a.h) === zwoelfer(b.h);
}

/**
 * Informal forms, the taught one first. `diese` is the hour as a word
 * («eins» for one — «fünf nach eins»), `naechste` the next hour, which
 * «halb» and «vor» name: «halb vier» is 3:30.
 */
export function informell(h: number, m: number): string[] {
  const stunde = zwoelfer(h);
  const diese = zahlwort(stunde);
  const naechste = zahlwort(stunde === 12 ? 1 : stunde + 1);
  switch (m) {
    case 0:
      return [`${stundeVorUhr(stunde)} Uhr`, diese];
    case 5:
      return [`fünf nach ${diese}`];
    case 10:
      return [`zehn nach ${diese}`];
    case 15:
      return [`Viertel nach ${diese}`, `viertel ${naechste}`];
    case 20:
      return [`zwanzig nach ${diese}`, `zehn vor halb ${naechste}`];
    case 25:
      return [`fünf vor halb ${naechste}`, `fünfundzwanzig nach ${diese}`];
    case 30:
      return [`halb ${naechste}`];
    case 35:
      return [`fünf nach halb ${naechste}`, `fünfundzwanzig vor ${naechste}`];
    case 40:
      return [`zwanzig vor ${naechste}`, `zehn nach halb ${naechste}`];
    case 45:
      return [
        `Viertel vor ${naechste}`,
        `drei viertel ${naechste}`,
        `dreiviertel ${naechste}`,
      ];
    case 50:
      return [`zehn vor ${naechste}`];
    case 55:
      return [`fünf vor ${naechste}`];
    default:
      throw new Error(`informell: faqat 5 daqiqalik qadam, keldi ${m}`);
  }
}

/** Official form, the hour as given (0–23): «fünfzehn Uhr dreißig». */
export function offiziell(h: number, m: number): string {
  const stunde = `${stundeVorUhr(h)} Uhr`;
  return m === 0 ? stunde : `${stunde} ${zahlwort(m)}`;
}

/** What the audio says: the taught informal form in a sentence. */
export function sprechtext(h: number, m: number): string {
  return `Es ist ${informell(h, m)[0]}.`;
}

/**
 * «zehn vor sechs» may also be said «zehn Minuten vor sechs». Only the
 * plain «X nach/vor H» forms get it: «halb» and «Viertel» never take
 * «Minuten».
 */
function mitMinuten(formen: string[]): string[] {
  return formen.flatMap((f) => {
    const t = /^(\S+) (nach|vor) (\S+)$/.exec(f);
    if (!t || /^(halb|viertel)$/i.test(t[1]) || t[3] === 'halb') return [];
    return [`${t[1]} Minuten ${t[2]} ${t[3]}`];
  });
}

/**
 * Every correct answer for a clock face showing `h:m`. `richtig` is the
 * taught informal form (shown after a wrong answer); `akzeptiert` holds
 * the other informal forms and their «Minuten» variants, the official form
 * for both halves of the day
 * (3:30 and 15:30 look the same) and each of them after «Es ist».
 * Case, ß/ss and umlauts are handled by `normalisieren` when comparing.
 */
export function uhrAntworten(
  h: number,
  m: number,
): { richtig: string; akzeptiert: string[] } {
  const [richtig, ...andere] = informell(h, m);
  const vormittag = zwoelfer(h) % 12;
  const formen = [
    richtig,
    ...andere,
    ...mitMinuten([richtig, ...andere]),
    offiziell(vormittag === 0 ? 12 : vormittag, m),
    offiziell(vormittag === 0 ? 0 : vormittag + 12, m),
  ];
  if (vormittag === 0 && m === 0) {
    formen.push('vierundzwanzig Uhr', 'Mittag', 'Mitternacht');
  }
  const alle = [...formen, ...formen.map((f) => `Es ist ${f}`)];
  return {
    richtig,
    akzeptiert: [...new Set(alle)].filter((f) => f !== richtig),
  };
}
