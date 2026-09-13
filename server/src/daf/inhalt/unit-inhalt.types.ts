/**
 * Unitning matni — bitta unitning hamma yozma materiali.
 *
 * Har fayl bitta narsani saqlaydi va alohida tekshiriladi. Bitta katta
 * `u01.json` o'rniga beshta fayl: ular alohida yaratiladi, alohida
 * ko'rikdan o'tadi, va biri qayta yasalganda qolganlari tegilmaydi.
 */

/** Ekranda ko'rinadigan va aytiladigan matn ajratilgan qator. */
export interface Sprechbar {
  de: string;
  /**
   * ElevenLabs'ga yuboriladigan matn.
   *
   * Yakka harf va raqamni TTS INGLIZCHA o'qiydi (`0176` → «Zero…»),
   * shuning uchun ular uchun aytilishi qo'lda yoziladi:
   * `null eins sieben sechs`.
   */
  tts?: string;
  uz: string;
}

export interface Wort extends Sprechbar {
  /** Barqaror kalit: `u01-s1-hallo`. Seed shu bo'yicha yangilaydi. */
  sourceId: string;
  section: string;
  artikel?: string;
  plural?: string;
  /**
   * Ko'rgazma raqami — `de`ning yonida ko'rsatiladigan RAQAM ko'rinishi
   * ("0", "1", ...), FAQAT sonlar uchun.
   *
   * `de` — o'rgatiladigan narsaning O'ZI, ya'ni nemischa so'z ("null",
   * "eins"), chunki yozma mashq shu maydon ustiga quriladi: agar `de`
   * raqam bo'lsa, mashq raqamni tanishni tekshiradi, nemischa so'zni
   * emas. `anzeige` esa faqat ko'z bilan qiyoslash uchun qo'shimcha —
   * "5 — fünf" kabi ko'rsatishga yordam beradi, lekin o'zi so'ralmaydi.
   *
   * Harflarda BUNDAY AJRALISH yo'q: harfning yozma shakli harfning
   * o'zi ("A" so'zi "A" harfidan boshqa narsa emas), shuning uchun
   * alifbo bo'limida `anzeige` ishlatilmaydi — faqat `de` (harf) va
   * `tts` (talaffuz: "Ah") bor.
   */
  anzeige?: string;
  /** `true` — mashqda so'raladi; `false` — faqat matnda uchraydi. */
  core: boolean;
  order: number;
}

export interface WoerterFile {
  unit: string;
  woerter: Wort[];
}

/** Bo'limning grammatika qoidasi — izoh o'zbekcha, misollar nemischa. */
export interface Regel {
  section: string;
  titelDe: string;
  titelUz: string;
  /**
   * Qoidaning o'zbekcha izohi.
   *
   * Nemischa atama (`Personalpronomen`) sarlavhada qoladi, izoh esa
   * o'zbekcha bo'ladi: boshlovchi qoidani ona tilida tushunadi, atamani
   * esa keyin taniydi.
   */
  erklaerungUz: string;
  beispiele: Sprechbar[];
}

export interface GrammatikFile {
  unit: string;
  regeln: Regel[];
}

/** Vaziyat → tayyor ibora. */
export interface Phrase extends Sprechbar {
  section: string;
  /** Nemischa funksiya nomi: `sich vorstellen`. */
  funktion: string;
  funktionUz: string;
}

export interface RedemittelFile {
  unit: string;
  phrasen: Phrase[];
}

/**
 * Dialog satri.
 *
 * Gapiruvchi ISM bilan yoziladi, «A»/«B» bilan emas: ovoz yasashda har
 * ismga bitta obraz biriktiriladi va shu obraz butun kursda o'zgarmaydi.
 */
export interface DialogZeile extends Sprechbar {
  sprecher: string;
}

/**
 * Suhbatni eshitgandan keyingi tushunish savoli (`HOEREN_WAHL`).
 *
 * Dialog faylining ICHIDA (dizayn Q4): savol o'z suhbatisiz ma'nosiz —
 * bittasi o'zgarsa ikkinchisi ko'z oldida. Barqaror kalit seedda
 * dialog kaliti + tartibdan yasaladi (`u02-d2-f1`).
 */
export interface HoerFrage {
  frageDe: string;
  frageUz: string;
  richtig: string;
  /** Ikki chalg'ituvchi — odam yozadi, har biri suhbatdan aniq xato. */
  falsch: string[];
}

export interface Dialog {
  /** Barqaror kalit: `u01-d1`. */
  id: string;
  section: string;
  titelDe: string;
  titelUz: string;
  zeilen: DialogZeile[];
  /**
   * Ixtiyoriy TIPDA, MAJBURIY QO'RIQCHIDA: matni yozilgan unitda har
   * dialogda aniq 2 savol bo'lishi kerak (`unit-inhalt.file.spec.ts`).
   * Tip ixtiyoriy, chunki eski testlar va yarim yozilgan unit
   * `fragen`siz dialog beradi.
   */
  fragen?: HoerFrage[];
}

export interface DialogeFile {
  unit: string;
  dialoge: Dialog[];
}

/**
 * Yasalgan gap.
 *
 * Manbadan olinmaydi: A1 dagi tayyor gaplarning atigi 27 % i tanish
 * so'zlardan tuzilgan edi, ya'ni qolgani o'quvchiga notanish so'z
 * ko'rsatardi.
 */
export interface Satz extends Sprechbar {
  /**
   * Barqaror kalit: `u01-s3-04` (bo'lim + bo'lim ichidagi tartib
   * raqami). Seed shu bo'yicha yangilaydi — massivdagi POZITSIYA emas,
   * shuning uchun faylning o'rtasidan bitta gap o'chirilsa ham qolgan
   * gaplarning nemischasi va audiosi joyida qoladi.
   */
  sourceId: string;
  section: string;
  wordCount: number;
  origin: 'GENERATED';
}

export interface SaetzeFile {
  unit: string;
  saetze: Satz[];
}

/**
 * Yordamchi so'z — lug'atga kirmaydigan, lekin matnda uchraydigan so'z.
 *
 * NEGA KONTENTDA, KODDA EMAS. Progressiya qo'riqchisi «bu so'z hali
 * o'rgatilmagan» deb yiqiladi, va uni jimlatishning yagona yo'li so'zni
 * shu ro'yxatga qo'shish. Kodda yozilganida ro'yxat uch joyda nusxalanib
 * bir-biridan uzoqlashib ketgan edi. Endi bitta fayl, va har yozuvda
 * `grund` MAJBURIY: sababsiz jimlatib bo'lmaydi.
 */
export interface Hilfswort {
  wort: string;
  grund: string;
  /**
   * Shu BO'LIMDAN boshlab ruxsat etiladi (masalan `u02-s2`).
   *
   * Yordamchi so'z progressiyadan ozod — aynan shuning uchun tuslangan
   * fe'l shakli («hast») lemmasi («haben») o'rgatiladigan bo'limdan
   * OLDIN ham ishlatilaverardi. Bu maydon o'sha teshikni yopadi:
   * shakl o'z qoidasi bilan birga ochiladi.
   *
   * Yozilmasa — hamma joyda ruxsat (artikl, bog'lovchi, atoqli ot).
   */
  abSection?: string;
}

export interface HilfswoerterFile {
  eintraege: Hilfswort[];
}
