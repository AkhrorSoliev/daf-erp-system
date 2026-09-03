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

/**
 * English words va book title'lardan kirgan so'zlar - PDF'ning "Literatüra"
 * bo'limida, rasmiy Goethe-Institut A1 ro'yxatidan keyin keladi.
 * Misol: "Waystage: Systems development in adult language learning"
 */
const ENGLISH_REFERENCE_WORDS = new Set([
  'objective',
  'modern',
  'ation',
  'language',
  'association',
  'system',
  'credit',
  'european',
  'unit',
]);

/**
 * PDF satrlari ajratilganda paydo bo'ladigan fragmentlar - qayta chiqarish
 * (re-extraction) o'zgargan taqdirda har-birlari sharhlanadi.
 */
const HYPHENATION_FRAGMENTS = new Set([
  'langenscheidt', // ← "Langenscheidt" (nashriyot nomi)
  'profile', // ← "Profile" (kitob nomi)
  'nikative', // ← "kommunikative" (PDF qator ajratilgani)
  'scheidt', // ← "Langenscheidt" (qator sharhi)
  'tur', // ← birorta so'zning oxiri
  'kultusminister', // ← "Kultusministerium" (tashkilot nomi)
  'schweizerischen', // ← "Schweizerischen" (kitob hujjat fragmenti)
  'europäischen', // ← "europäischen" (kitob nomi fragmenti)
  'müller', // ← "Müller" (muallif nomi)
  'gemeinsamer', // ← "Gemeinsamer" (kitob nomi)
  'urteilen', // ← PDF chiqarish fragmenti
  'sche', // ← "technische" yoki shunga o'xshash (PDF qator ajratilgani)
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

    const m = /^(?:(der|die|das)\s+)?([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.-]*)/.exec(line);
    if (!m) continue;

    const artikel = m[1] || null;
    const wort = m[2];
    if (wort.length < 2) continue;

    // Literature reference va title'sdan fragmentlarni tashlaydi
    // (masalan, "Waystage." yoki kitob nomlaridan "ALTE")
    if (wort.endsWith('.')) continue;
    // "LITerATur" ko'rinishdagi bo'lim sarlavhasi (case-insensitive, PDF ishlab chiqarish artifact'i)
    if (wort.toLowerCase() === 'literatur') continue;
    // All-caps so'zlar (bo'limlik sarlavhalar yoki kitob nomlari)
    if (wort.length > 1 && wort === wort.toUpperCase()) continue;
    // English reference-section so'zlar
    if (ENGLISH_REFERENCE_WORDS.has(wort.toLowerCase())) continue;
    // PDF hyphenation / line-break fragmentlari
    if (HYPHENATION_FRAGMENTS.has(wort.toLowerCase())) continue;

    const key = `${artikel ?? ''} ${wort}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ artikel, wort });
  }

  return out;
}
