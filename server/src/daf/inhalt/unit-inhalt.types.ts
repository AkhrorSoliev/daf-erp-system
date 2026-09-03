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

export interface Dialog {
  /** Barqaror kalit: `u01-d1`. */
  id: string;
  section: string;
  titelDe: string;
  titelUz: string;
  zeilen: DialogZeile[];
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
  section: string;
  wordCount: number;
  origin: 'GENERATED';
}

export interface SaetzeFile {
  unit: string;
  saetze: Satz[];
}
