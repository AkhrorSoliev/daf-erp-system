/**
 * Javobni solishtirish.
 *
 * NEGA KECHIRIMLI. Boshlovchi `tschüss` ni `tschuess` deb yozadi, chunki
 * klaviaturasida umlaut yo'q; `heißen` ni `heissen` deb yozadi, chunki
 * ß ni qayerdan olishni bilmaydi. Bularning ikkalasi ham NEMISCHADA
 * to'g'ri yozuv hisoblanadi. Ularni «xato» deb belgilash o'quvchini
 * imlo klaviaturasi bilan jazolash bo'lardi, tilni bilishi bilan emas.
 *
 * NEGA O'ZBEKCHA YOZDIRILMAYDI. Bu funksiya faqat NEMISCHA javob uchun.
 * O'zbekcha tarjimaning o'nlab to'g'ri shakli bor va to'g'ri javobni
 * «xato» deb belgilash o'quvchini eng tez qochiradigan narsa.
 */

const UMLAUT: Array<[RegExp, string]> = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
];

export function normalisieren(s: string): string {
  let out = s.toLowerCase().trim();
  for (const [from, to] of UMLAUT) out = out.replace(from, to);
  out = out.replace(/[.,!?;:]/g, '');
  out = out.replace(/\s+/g, ' ');
  return out.trim();
}

/**
 * `akzeptiert` — materialda yozilgan QO'SHIMCHA to'g'ri javoblar.
 * Bo'sh javob har doim xato: «hech narsa yozmaslik» to'g'ri bo'la olmaydi.
 */
export function istRichtig(
  gegeben: string,
  richtig: string,
  akzeptiert: string[] = [],
): boolean {
  const g = normalisieren(gegeben);
  if (g === '') return false;
  return [richtig, ...akzeptiert].some((r) => normalisieren(r) === g);
}

const ARTIKEL = new Set(['der', 'die', 'das']);

/** Shorter words turn into other words with one letter (vier/hier, neun/neu). */
const TIPPFEHLER_MIN_LAENGE = 5;

/**
 * Optimal string alignment distance: insertions, deletions, substitutions
 * and one swap of neighbours ("deustch") each cost one.
 */
function editAbstand(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + kosten,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * One word, normalised: `g` is one edit from `r`. `original` is the correct
 * word as written, for its capital letter.
 */
function wortTippfehler(g: string, r: string, original: string): boolean {
  if (r.length < TIPPFEHLER_MIN_LAENGE) return false;
  if (editAbstand(g, r) !== 1) return false;
  // A lowercase word (verb, adjective, number) carries grammar in its last
  // two letters: "wohne" is another form of "wohnen", not a slip. German
  // nouns are capitalised, so their endings stay forgiven ("Morgwn").
  const kleingeschrieben =
    original !== '' && original[0] === original[0].toLowerCase();
  if (kleingeschrieben) {
    let praefix = 0;
    while (praefix < r.length && r[praefix] === g[praefix]) praefix += 1;
    if (praefix >= r.length - 2) return false;
  }
  return true;
}

function einTippfehler(gegeben: string, richtig: string): boolean {
  const g = normalisieren(gegeben);
  const r = normalisieren(richtig);
  if (g === '' || g === r) return false;
  const gt = g.split(' ');
  const rt = r.split(' ');
  const originale = richtig
    .trim()
    .replace(/[.,!?;:]/g, '')
    .split(/\s+/);
  // A wrong article is grammar, not spelling — never forgiven.
  const mitArtikel = rt.some((t) => ARTIKEL.has(t));

  if (gt.length !== rt.length) {
    // Spaces left out or added ("aufwiedersehen"): compare without them.
    if (mitArtikel) return false;
    const gOhne = gt.join('');
    const rOhne = rt.join('');
    return (
      gOhne === rOhne ||
      wortTippfehler(gOhne, rOhne, originale[originale.length - 1] ?? '')
    );
  }
  const anders = rt.flatMap((t, i) => (t === gt[i] ? [] : [i]));
  if (anders.length !== 1) return false;
  const i = anders[0];
  if (ARTIKEL.has(rt[i]) || ARTIKEL.has(gt[i])) return false;
  return wortTippfehler(gt[i], rt[i], originale[i] ?? '');
}

/**
 * A typed answer one slip away from a correct one (Duolingo accepts these
 * and shows the right spelling). `false` for an answer that is already
 * correct — ask `istRichtig` first.
 */
export function tippfehler(gegeben: string, richtige: string[]): boolean {
  return richtige.some((r) => einTippfehler(gegeben, r));
}
