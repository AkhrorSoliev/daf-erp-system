/**
 * Qaysi lug'at yozuviga sun'iy intellekt rasm chiza olishini aniqlaydi.
 *
 * Bu qaror bir marta qabul qilinadi va odam ko'rib chiqadi
 * (`content/daf/picturable.json`), shuning uchun tekshiruv qat'iy: model
 * javobi so'ralgan sondan farq qilsa, qaysi javob qaysi so'zga tegishli
 * ekani noma'lum bo'lib qoladi — natija indeksi siljigan, ko'rinmas xato
 * bo'lardi (har so'z javobli bo'lib turadi, faqat noto'g'ri so'zga).
 */

export interface PicturableCandidate {
  /** Nemischa asl matn. */
  de: string;
  /** Inglizcha izoh — nemischa ko'p ma'noli bo'lganda ma'noni aniqlashtiradi. */
  en: string;
}

/**
 * A1 lug'atidagi mamlakat nomlari.
 *
 * DIQQAT: bu ro'yxat "bularga rasm kerak emas" degani EMAS — "sun'iy
 * intellekt bularni CHIZMASIN" degani. Flux bayroqlarni xato chizadi
 * (rang tartibi, yulduz soni noto'g'ri chiqadi). Shuning uchun bu so'zlar
 * `picturable: false` qilib qo'yiladi, ya'ni `daf-gen-images` (8-task)
 * ularni generatorga umuman yubormaydi.
 *
 * 8-task oxirida (Step 10) bu mamlakatlarga tayyor bayroq rasm fayllari
 * qo'lda beriladi va o'shanda `picturable: true` ga QAYTARILADI. Shu
 * tartib muhim: agar kimdir buni "abstrakt so'zlar" bilan bir xil deb
 * o'ylab butunlay picturable=false qilib qoldirsa, mamlakatlar hech qachon
 * rasm olmaydi.
 */
export const COUNTRIES: Set<string> = new Set([
  'Belgien',
  'Italien',
  'Deutschland',
  'die Niederlande',
  'Kanada',
  'Luxemburg',
  'Polen',
  'Österreich',
  'Mexiko',
  'die Schweiz',
  'Frankreich',
  'Spanien',
  // Quyidagi to'rttasi dastlabki ro'yxatda yo'q edi — bazani so'rab
  // tasdiqlandi (`dib-voc-01-04..05`). Xuddi shu sabab bilan: bayroqsiz
  // qoladilar.
  'die U.S.A.',
  'der Irak',
  'die Türkei',
  'Ungarn',
]);

/**
 * A1 lug'atidagi qit'a nomlari.
 *
 * Mamlakatlar bilan bir xil muammo: Flux xaritani/qit'a shaklini xato
 * chizadi, natija ishonchsiz bo'ladi. Shuning uchun COUNTRIES bilan bir
 * xil qoidaga bo'ysunadi (generatorga tushmaydi), lekin alohida
 * to'plamda turadi — mamlakat va qit'a boshqa-boshqa tushuncha, testlar
 * ham shuni alohida tekshiradi.
 */
export const CONTINENTS: Set<string> = new Set([
  'Afrika',
  'Amerika',
  'Asien',
  'Australien',
  'Europa',
]);

/**
 * Artikl va qavs ichidagi izohni tashlaydi ("die Schweiz" -> "Schweiz",
 * "die Niederlande (Holland)" -> "Niederlande",
 * "Amerika (Nord-, Mittel-, Südamerika)" -> "Amerika").
 *
 * Qavs izohi bazada haqiqatan ham uchraydi (lug'atda "Niderlandiya"ni
 * "Gollandiya" bilan bog'lash yoki qit'aning qismlarini sanash uchun):
 * buni tashlamasa `isCountry`/`isContinent` bunday yozuvni TANIMAYDI, u
 * modelga tushib qoladi va bayroq/xarita bo'lmagan so'zga rasm
 * chizishga urinadi. Aynan shu xato "die Niederlande (Holland)" bilan
 * bir marta chiqqan edi — shuning uchun bu funksiya COUNTRIES va
 * CONTINENTS ikkalasi uchun ham UMUMIY.
 */
function normalizeGeoName(de: string): string {
  return de
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/^(der|die|das)\s+/i, '')
    .trim();
}

/**
 * `de` matni COUNTRIES ro'yxatidagi mamlakat nomimi.
 *
 * Artiklni tashlab solishtiradi, chunki lug'atda ba'zi mamlakatlar
 * artikllik ("die Schweiz"), ba'zilari artiklsiz ("Deutschland") yozilgan.
 */
export function isCountry(de: string): boolean {
  const bare = normalizeGeoName(de);
  for (const country of COUNTRIES) {
    if (normalizeGeoName(country) === bare) return true;
  }
  return false;
}

/** `de` matni CONTINENTS ro'yxatidagi qit'a nomimi (izohni tashlab). */
export function isContinent(de: string): boolean {
  const bare = normalizeGeoName(de);
  for (const continent of CONTINENTS) {
    if (normalizeGeoName(continent) === bare) return true;
  }
  return false;
}

/** Mamlakat YOKI qit'a — ikkalasi ham "bayroqsiz/xaritasiz" turkumga kiradi. */
export function isGeographicProperNoun(de: string): boolean {
  return isCountry(de) || isContinent(de);
}

/**
 * Nemischa son so'zlarini QOIDA bilan (qo'lda terilgan ro'yxat emas)
 * hosil qiladi: 0 dan 9999 gacha har bir son uchun tilning tuzilish
 * qoidasi qo'llaniladi (masalan 77 = "sieben" + "und" + "siebzig").
 *
 * Nega ro'yxat emas: sonlarga rasm chizib bo'lmaydi — bizning rasm
 * uslubimiz "hech qanday matn, harf yoki yozuv" ni qat'iy taqiqlaydi
 * (Flux harflarni buzib chizadi, va yozuv aslida qaysi son ekanini
 * oshkor qilib qo'yardi). Ikkita olma chizib "2" ni ko'rsatish ham
 * ishlamaydi — bu rasm "olma" so'ziga teng darajada to'g'ri keladi,
 * mashq noaniq bo'ladi. Shuning uchun HAR BIR son (nafaqat lug'atda
 * uchragan bir nechtasi) `false` bo'lishi kerak — qoida bu ishni
 * ro'yxatdan ancha ishonchli bajaradi.
 */
const ONES = [
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
];
/** Qo'shma sonlarda "eins" emas, "ein" ishlatiladi ("einundzwanzig"). */
const ONES_COMPOUND = [
  '',
  'ein',
  'zwei',
  'drei',
  'vier',
  'fünf',
  'sechs',
  'sieben',
  'acht',
  'neun',
];
const TEENS = [
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
const TENS = [
  '',
  '',
  'zwanzig',
  'dreißig',
  'vierzig',
  'fünfzig',
  'sechzig',
  'siebzig',
  'achtzig',
  'neunzig',
];

function germanNumberWord0to99(n: number): string {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS[tens] : `${ONES_COMPOUND[ones]}und${TENS[tens]}`;
}

function germanNumberWord(n: number): string {
  if (n < 100) return germanNumberWord0to99(n);
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const hundredPart = `${h === 1 ? '' : ONES_COMPOUND[h]}hundert`;
    return rest === 0 ? hundredPart : hundredPart + germanNumberWord0to99(rest);
  }
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  const thousandPart = `${th === 1 ? '' : germanNumberWord(th)}tausend`;
  return rest === 0 ? thousandPart : thousandPart + germanNumberWord(rest);
}

/** 0–9999 oralig'idagi barcha son so'zlari — bir marta hisoblanadi. */
const NUMBER_WORDS: Set<string> = (() => {
  const set = new Set<string>();
  for (let n = 0; n <= 9999; n++) set.add(germanNumberWord(n));
  return set;
})();

/**
 * Solishtirish uchun faqat harflarni qoldiradi: artikl yo'q (sonlarda
 * artikl bo'lmaydi), bo'shliq/qavs/tinish belgilari yo'q, kichik harf.
 *
 * "(und)" ni ham olib tashlaydi — bazada "hundert(und)eins" kabi
 * muqobil shakl qavs ichida ko'rsatilgan (xuddi "Samstag / Sonnabend"
 * dagi kabi, lekin bu yerda "/" o'rniga qavs ishlatilgan).
 */
function normalizeForNumberCheck(de: string): string {
  return de
    .toLowerCase()
    .replace(/\(und\)/g, '')
    .replace(/[^a-zäöüß]/g, '');
}

/** `de` matni generatsiya qilingan son so'zlaridan biriga TENG kelamimi. */
export function isNumberWord(de: string): boolean {
  return NUMBER_WORDS.has(normalizeForNumberCheck(de));
}

/**
 * "die Zahl" / "die Nummer" — sonning O'ZI emas, sonlash tushunchasi
 * haqidagi mavhum otlar. Bular `germanNumberWord` qoidasidan chiqmaydi
 * (algoritm faqat qiymatlarni yasaydi, tushunchani emas), shuning uchun
 * alohida, qisqa, qo'lda ko'rib chiqilgan ro'yxatda turadi — xuddi
 * COUNTRIES kabi, chunki bu yerda ham to'plam yopiq va kichik.
 *
 * DIQQAT: bu aniq LEKSEMA solishtiruvi (artikl+ot), pastki qator
 * solishtiruvi EMAS — aks holda "die Postleitzahl" ("Zahl" so'zini ICHIDA
 * saqlagani uchun) ham noto'g'ri ushlanib qolardi.
 */
const NUMBER_CONCEPT_WORDS: Set<string> = new Set(['Zahl', 'Nummer']);

function isNumberConcept(de: string): boolean {
  return NUMBER_CONCEPT_WORDS.has(normalizeGeoName(de));
}

/** Son so'zi (`zwei`) YOKI son haqidagi mavhum ot (`die Zahl`). */
export function isNumeric(de: string): boolean {
  return isNumberWord(de) || isNumberConcept(de);
}

/**
 * Gap yoki ibora — bitta so'z/ot emas.
 *
 * Ikki alomat: (1) gap tugash belgisi bilan tugaydi (`.`, `!`, `?`,
 * ellipsis `…`) — "Wie heißt du?", "Ich heiße…"; (2) "/" bilan IKKI
 * shakl berilgan — "Ich bin Student/Studentin", "Bis dann! / Bis
 * später!". Qavs ichidagi ko'plik ("das Land (die Länder)") ikkalasiga
 * ham tushmaydi — u oddiy ot, ibora emas.
 *
 * DIQQAT: bu qoida "/" ni har doim ibora deb hisoblaydi, hatto u
 * "der/das Laptop" yoki "das Sofa / die Couch" kabi BITTA tushunchaning
 * ikki muqobil nomini bergan holatda ham. Bu haqiqatan ham bir nechta
 * chizsa bo'ladigan so'zni (noutbuk, divan) rasm ro'yxatidan chiqarib
 * tashlaydi — lekin ikkalasini ajratish uchun grammatik tahlil kerak
 * bo'lardi (bu yerdagi oddiy matn qoidasi buni qila olmaydi), va aniq
 * gap holatini ("Ich bin Student/Studentin") o'tkazib yubormaslik
 * muhimroq, chunki gapga rasm chizish generatsiyani butunlay chalkashtiradi.
 */
export function isPhrase(de: string): boolean {
  const trimmed = de.trim();
  if (/[.!?…]$/.test(trimmed)) return true;
  if (trimmed.includes('/')) return true;
  return false;
}

/**
 * Model nima desa ham (yoki `picturable.json` allaqachon nima yozgan
 * bo'lsa ham) `true` BO'LMASLIGI kerak bo'lgan yozuvlar.
 *
 * Bu funksiya ataylab OXIRGI qatlam — model so'roviga yoki mavjud
 * faylni o'qishga bog'liq emas. Sabab: `picturable.json` mavjud bo'lganda
 * model UMUMAN chaqirilmaydi (fayl — manba). Agar mamlakat/son/ibora
 * qoidasi faqat so'rov MATNI ichida (`buildPicturablePrompt`) tursa, u
 * eski, qoidasiz paytda yozib qo'yilgan faylga hech qachon ta'sir
 * qilmaydi — bu reja davomida olti marta chiqqan «tekshirilmagan
 * bog'lanish jimgina uziladi» naqshining aynan o'zi bo'lardi. Shuning
 * uchun bu tekshiruv skriptda modelning/faylning javobidan qat'i nazar,
 * SO'ZSIZ qo'llanadi (`applyNeverPicturableRule`), oldindan filtr
 * sifatida ham (modelga behuda so'ramaslik uchun).
 */
export function isNeverPicturable(de: string): boolean {
  return isGeographicProperNoun(de) || isNumeric(de) || isPhrase(de);
}

export interface PicturableItem {
  sourceId: string;
  de: string;
}

export type PicturableMap = Record<string, boolean>;

/**
 * `isNeverPicturable` qoidasini natijaga SO'ZSIZ qo'llaydi — manbasidan
 * qat'i nazar (yangi model javobimi, eskidan `picturable.json`dan
 * o'qilganmi). Har doim shu funksiyadan o'tkazilgan natija yoziladi;
 * hech qachon `result` to'g'ridan-to'g'ri faylga yoki bazaga yozilmaydi.
 */
export function applyNeverPicturableRule(
  items: PicturableItem[],
  result: PicturableMap,
): PicturableMap {
  const filtered: PicturableMap = { ...result };
  for (const item of items) {
    if (isNeverPicturable(item.de)) {
      filtered[item.sourceId] = false;
    }
  }
  return filtered;
}

export class PicturableCountMismatchError extends Error {
  constructor(expected: number, got: number) {
    super(
      `Javoblar soni mos kelmadi: ${expected} ta so'raldi, ${got} ta qaytdi`,
    );
    this.name = 'PicturableCountMismatchError';
  }
}

/**
 * Modeldan har so'z uchun "rasm bilan aniq ko'rsatib bo'ladimi" javobini
 * so'raydi.
 *
 * Nemischa va inglizcha ma'no birga beriladi: nemischa yolg'iz ko'p
 * ma'noli bo'lishi mumkin (masalan `Bank` — o'rindiqmi, bankmi), inglizcha
 * izoh shuni aniqlashtiradi.
 */
export function buildPicturablePrompt(items: PicturableCandidate[]): string {
  const lines = items
    .map((it, i) => `${i + 1}. ${it.de}  [en: ${it.en}]`)
    .join('\n');

  return [
    "Siz nemis tili o'quvchilari uchun lug'at kartochkalariga rasm",
    "tayyorlaysiz. Har bir so'z yoki ibora uchun savol bitta: uni BITTA",
    "aniq, konkret rasm bilan noaniqliksiz ko'rsatib bo'ladimi?",
    '',
    "HA: aniq predmet, jonzot, joy yoki ko'rinadigan aniq harakat",
    '  (masalan: der Apfel, das Auto, laufen).',
    "YO'Q: mavhum tushuncha, munosabat, sifat/his-tuyg'u so'zi, gap yoki",
    '  ibora (masalan: die Verantwortung, weil, Wie heißt du?).',
    '',
    'Qoidalar:',
    "- Nemischa matn ASOSIY manba. Inglizcha izoh faqat ma'noni",
    '  aniqlashtirish uchun berilgan.',
    "- Har qatorga bitta javob, faqat 'ha' yoki 'yo`q'.",
    "- Javob formati qat'iy: '1. ha', '2. yo`q', va hokazo — raqam, nuqta,",
    "  bo'shliq, javob.",
    `- Javoblar soni ANIQ ${items.length} ta bo'lishi shart.`,
    '',
    "So'zlar:",
    lines,
  ].join('\n');
}

/**
 * Model javobidan `ha`/`yo'q` ro'yxatini o'qiydi.
 *
 * Javoblar soni `expected` ga QAT'IY teng bo'lishi shart. Mos kelmasa
 * yiqiladi — chunki siljigan javoblar boshqa so'zga tushib qoladi, va bu
 * xato ko'rinmaydi (har so'z javobli bo'lib turadi).
 */
export function parsePicturable(raw: string, expected: number): boolean[] {
  const answers = [...raw.matchAll(/^\s*\d+\.\s*(.+?)\s*$/gm)].map((m) => m[1]);

  if (answers.length !== expected) {
    throw new PicturableCountMismatchError(expected, answers.length);
  }

  return answers.map((a) => /^ha\b/i.test(a));
}
