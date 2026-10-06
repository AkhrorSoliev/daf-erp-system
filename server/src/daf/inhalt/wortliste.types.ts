/**
 * Qaysi so'z qaysi bo'limga tegishli — FAQAT biriktirish.
 *
 * So'zning tarjimasi, talaffuzi va rasmi bu yerda emas: ular unitning
 * o'z faylida (`u01/woerter.json`). Sabab — biriktirish butun kurs
 * bo'yicha yagona bo'lishi kerak (bir so'z ikki bo'limda o'rgatilmaydi),
 * tarjima esa unitning ichki ishi.
 *
 * Fayl butun A1 rejasini tutadi (ADR-0071): hali yozilmagan unitlarning
 * so'zlari ham shu yerda. Har Goethe A1 so'zi shu yerda, yordamchi
 * so'zlarda yoki `ausgenommen`da turadi; yozilgan unitning asosiy so'zlari
 * rejaning o'zi (`nachtrag`dan tashqari).
 */
export interface WortEintrag {
  wort: string;
  artikel: string | null;
  /** `kurs.json` dagi bo'lim kaliti, masalan `u01-s3`. */
  section: string;
  /** `true` — mashqda so'raladi; `false` — faqat matnda uchraydi. */
  core: boolean;
  /**
   * Goethe ro'yxatidan tashqaridagi so'z uchun SABAB.
   *
   * Sababsiz qo'shish taqiqlangan: ro'yxatdan chetga chiqish qaror,
   * va qaror yozilmasa keyin uni tekshirib bo'lmaydi.
   */
  grund?: string;
  /**
   * `true` — the word is built from words already taught (dreizehn = drei +
   * zehn, einundzwanzig = eins + und + zwanzig), so it does not count
   * against a section's or a unit's word budget. It still needs a `grund`:
   * stepping outside the budget is a decision and must say why.
   */
  ausserhalbBudget?: boolean;
  /**
   * `true` — planned for a unit whose text is already written; the text
   * gets the word in the backfill step (ADR-0071). Until then the unit's
   * own words need not contain it.
   */
  nachtrag?: boolean;
  /**
   * Goethe headwords this entry teaches when its own spelling differs:
   * «auf Wiederhören» teaches «Wiederhören».
   */
  deckt?: string[];
}

/** A Goethe word deliberately not taught, with the decision behind it. */
export interface AusgenommenesWort {
  wort: string;
  artikel: string | null;
  grund: string;
}

export interface WortlisteFile {
  level: 'A1';
  eintraege: WortEintrag[];
  /**
   * Goethe words not taught by decision (CEO 03.10.2026: pork and alcohol
   * only to refuse them). The coverage check counts them as decided.
   */
  ausgenommen?: AusgenommenesWort[];
}
