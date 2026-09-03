/**
 * Goethe A1 Wortliste'sining matnidan BOSH SO'ZLARNI ajratadi.
 *
 * Faqat ro'yxat olinadi — qaysi so'z A1 ga kiradi degan FAKT. Nashrning
 * misol gaplari ko'chirilmaydi: ular Goethe-Institut ning matni, bizniki
 * emas. O'z misollarimizni o'zimiz yozamiz.
 *
 * Manba: https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf
 */
export interface GoetheWort {
  artikel: string | null;
  wort: string;
}

export interface GoetheFile {
  source: string;
  words: GoetheWort[];
}

const ARTIKEL = new Set(['der', 'die', 'das']);

// English so'zlar va referenslar fragmentlari - PDF'ning tasnifi bo'limidan
// to'qnash bo'limiga o'tganda kirib qolgan so'zlar
const ENGLISH_WORDS_TO_SKIP = new Set([
  'objective',
  'modern',
  'ation',
  'language',
  'association',
  'system',
  'credit',
  'european',
  'unit',
  // Referenslar bo'limining to'l so'zlar va fragmentlari
  'langenscheidt',
  'profile',
  'nikative',
  'scheidt',
  'tur',
  'kultusminister',
  'schweizerischen',
  'europäischen',
  'müller',
  'gemeinsamer',
  'urteilen',
  'sche',
]);


/**
 * Bosh so'z satr BOSHIDA turadi. Ichkariga surilgan satr — oldingi
 * so'zning ikkinchi misoli yoki hosila yozuvi; uni bosh so'z deb olsak
 * ro'yxatga misol gapning birinchi so'zi tushib qolardi.
 */
export function parseGoetheLines(lines: string[]): GoetheWort[] {
  const out: GoetheWort[] = [];
  const seen = new Set<string>();

  for (const raw of lines) {
    if (raw.startsWith(' ') || raw.startsWith('\t')) continue;

    const line = raw.replace(/­/g, '').replace(/\t/g, ' ').trim();
    if (line === '' || line.startsWith('VS_02')) continue;
    // Alifbo ajratgichi: bitta harf.
    if (/^[A-ZÄÖÜ]$/.test(line)) continue;

    const m = /^(der|die|das)?\s*([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.-]*)/.exec(line);
    if (!m) continue;

    const artikel = m[1] && ARTIKEL.has(m[1]) ? m[1] : null;
    const wort = m[2];
    if (wort.length < 2) continue;

    // Literature reference va title'sdan fragmentlarni tashlaydi
    // (masalan, "Waystage." yoki kitob nomlaridan "ALTE")
    if (wort.endsWith('.')) continue;
    if (wort === 'LITerATur') continue;
    // All-caps so'zlar (bo'limlik sarlavhalar yoki kitob nomlari)
    if (wort.length > 1 && wort === wort.toUpperCase()) continue;
    // English so'zlar va fragmentlar - referenslar bo'limidan kirgan
    if (ENGLISH_WORDS_TO_SKIP.has(wort.toLowerCase())) continue;

    const key = `${artikel ?? ''} ${wort}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ artikel, wort });
  }

  return out;
}
