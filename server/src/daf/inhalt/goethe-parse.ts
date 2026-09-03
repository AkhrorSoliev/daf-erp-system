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
  gruppen?: GoetheGruppen;
}

export interface GoetheGruppen {
  zahlen: GoetheWort[];
  wochentage: GoetheWort[];
  monate: GoetheWort[];
  jahreszeiten: GoetheWort[];
}

const ARTIKEL = new Set(['der', 'die', 'das']);

/**
 * Goethe A1 Wortgruppenliste — yopiq to'plamlar PDF'ning 6–8-sahifalardan
 * (tangli ustun bloklari — tahlil qilib o'qiy bo'lmaydi). Raqamlar, hafta kunlari,
 * oylar, fasatlar A1 standartiga zaruridir, alifbohla harflar ro'yxatida yo'q.
 *
 * Nouns darajasida — "null" raqam (telefon raqami uchun) shu chaman. Hamma
 * shaxs nomlari (oylar, kunlar, fasatlar) "der"/"die"/"das" artikli o'z bilan.
 *
 * Bu to'plamlar eng yangilanmasa ham barkaror, shuning uchun qo'lda kiritilgan.
 * Qayta chiqarish (re-extraction) kerak bo'lsa, shuni yangilash yetarli.
 */
export const GOETHE_ZAHLEN: GoetheWort[] = [
  { artikel: null, wort: 'null' },
  { artikel: null, wort: 'eins' },
  { artikel: null, wort: 'zwei' },
  { artikel: null, wort: 'drei' },
  { artikel: null, wort: 'vier' },
  { artikel: null, wort: 'fünf' },
  { artikel: null, wort: 'sechs' },
  { artikel: null, wort: 'sieben' },
  { artikel: null, wort: 'acht' },
  { artikel: null, wort: 'neun' },
  { artikel: null, wort: 'zehn' },
  { artikel: null, wort: 'elf' },
  { artikel: null, wort: 'zwölf' },
  { artikel: null, wort: 'dreizehn' },
  { artikel: null, wort: 'vierzehn' },
  { artikel: null, wort: 'fünfzehn' },
  { artikel: null, wort: 'sechzehn' },
  { artikel: null, wort: 'siebzehn' },
  { artikel: null, wort: 'achtzehn' },
  { artikel: null, wort: 'neunzehn' },
  { artikel: null, wort: 'zwanzig' },
  { artikel: null, wort: 'einundzwanzig' },
  { artikel: null, wort: 'dreißig' },
  { artikel: null, wort: 'vierzig' },
  { artikel: null, wort: 'fünfzig' },
  { artikel: null, wort: 'sechzig' },
  { artikel: null, wort: 'siebzig' },
  { artikel: null, wort: 'achtzig' },
  { artikel: null, wort: 'neunzig' },
  { artikel: null, wort: 'hundert' },
  { artikel: null, wort: 'tausend' },
];

export const GOETHE_WOCHENTAGE: GoetheWort[] = [
  { artikel: 'der', wort: 'Montag' },
  { artikel: 'der', wort: 'Dienstag' },
  { artikel: 'der', wort: 'Mittwoch' },
  { artikel: 'der', wort: 'Donnerstag' },
  { artikel: 'der', wort: 'Freitag' },
  { artikel: 'der', wort: 'Samstag' },
  { artikel: 'der', wort: 'Sonntag' },
];

export const GOETHE_MONATE: GoetheWort[] = [
  { artikel: 'der', wort: 'Januar' },
  { artikel: 'der', wort: 'Februar' },
  { artikel: 'der', wort: 'März' },
  { artikel: 'der', wort: 'April' },
  { artikel: 'der', wort: 'Mai' },
  { artikel: 'der', wort: 'Juni' },
  { artikel: 'der', wort: 'Juli' },
  { artikel: 'der', wort: 'August' },
  { artikel: 'der', wort: 'September' },
  { artikel: 'der', wort: 'Oktober' },
  { artikel: 'der', wort: 'November' },
  { artikel: 'der', wort: 'Dezember' },
];

export const GOETHE_JAHRESZEITEN: GoetheWort[] = [
  { artikel: 'der', wort: 'Frühling' },
  { artikel: 'der', wort: 'Sommer' },
  { artikel: 'der', wort: 'Herbst' },
  { artikel: 'der', wort: 'Winter' },
];

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

/**
 * Sonlar (0-20) RAQAM ↔ SO'Z moslashuvi.
 *
 * Wortliste'da sonlar RAQAM ko'rinishida yoziladi ("0", "1", ...) — TTS
 * buni to'g'ri talaffuz qilishi uchun so'z shakli alohida `tts` maydonida
 * yoziladi (`sonlar 0-20 tema, u01-s4`). Goethe ro'yxati esa so'z shaklini
 * saqlaydi (`gruppen.zahlen`: "null", "eins", ...). Bu jadval ikkalasini
 * QIYMAT orqali bog'laydi — `gruppen.zahlen` massivining TARTIBIGA
 * (index'iga) hech qanday ishonch yo'q: massiv qisqarsa yoki qayta
 * tartiblansa, `isWordInGoetheA1` baribir to'g'ri javob berishi kerak.
 */
export const GOETHE_ZIFFER_ZU_WORT: ReadonlyMap<string, string> = new Map([
  ['0', 'null'],
  ['1', 'eins'],
  ['2', 'zwei'],
  ['3', 'drei'],
  ['4', 'vier'],
  ['5', 'fünf'],
  ['6', 'sechs'],
  ['7', 'sieben'],
  ['8', 'acht'],
  ['9', 'neun'],
  ['10', 'zehn'],
  ['11', 'elf'],
  ['12', 'zwölf'],
  ['13', 'dreizehn'],
  ['14', 'vierzehn'],
  ['15', 'fünfzehn'],
  ['16', 'sechzehn'],
  ['17', 'siebzehn'],
  ['18', 'achtzehn'],
  ['19', 'neunzehn'],
  ['20', 'zwanzig'],
]);

/**
 * O'zbek A1 o'quv tizimida so'z Goethe standartiga mos ekanini tekshiradi.
 * Alifbohla ro'yxat yoki yopiq to'plamlarda mavjud bo'lsa — TRUE.
 *
 * RAQAM ko'rinishidagi so'z (masalan "13") ham to'g'ri tekshiriladi: u
 * `GOETHE_ZIFFER_ZU_WORT` orqali kutilgan nemischa so'zga ("dreizehn")
 * aylantiriladi, so'ng o'sha so'z `gruppen.zahlen`da HAQIQATDA bormi —
 * QIYMAT bo'yicha — tekshiriladi. Agar `gruppen.zahlen` qisqartirilgan
 * yoki qayta tartiblangan bo'lib, kutilgan so'zni saqlamasa, natija FALSE
 * bo'ladi (rad etiladi) — index bo'yicha "rost" deb hisoblanmaydi.
 *
 * Ishlatuvchi uchun: bir so'zni "rasmiy A1 lug'atda bor/yo'q" qilip tekshirish uchun.
 */
export function isWordInGoetheA1(wort: string, file: GoetheFile): boolean {
  // Alifbohla ro'yxatda
  if (file.words.some((w) => w.wort.toLowerCase() === wort.toLowerCase())) {
    return true;
  }

  // Raqam ko'rinishi ("0".."20") — qiymat bo'yicha, index bo'yicha emas
  if (/^\d+$/.test(wort)) {
    const kutilganSoz = GOETHE_ZIFFER_ZU_WORT.get(wort);
    if (kutilganSoz === undefined) {
      return false;
    }
    return (file.gruppen?.zahlen ?? []).some(
      (w) => w.wort.toLowerCase() === kutilganSoz.toLowerCase(),
    );
  }

  // Yopiq to'plamlarda
  if (file.gruppen) {
    const { zahlen, wochentage, monate, jahreszeiten } = file.gruppen;

    if (zahlen?.some((w) => w.wort.toLowerCase() === wort.toLowerCase())) {
      return true;
    }
    if (wochentage?.some((w) => w.wort.toLowerCase() === wort.toLowerCase())) {
      return true;
    }
    if (monate?.some((w) => w.wort.toLowerCase() === wort.toLowerCase())) {
      return true;
    }
    if (jahreszeiten?.some((w) => w.wort.toLowerCase() === wort.toLowerCase())) {
      return true;
    }
  }

  return false;
}
