/**
 * Qaysi so'z qaysi bo'limga tegishli — FAQAT biriktirish.
 *
 * So'zning tarjimasi, talaffuzi va rasmi bu yerda emas: ular unitning
 * o'z faylida (`u01/woerter.json`). Sabab — biriktirish butun kurs
 * bo'yicha yagona bo'lishi kerak (bir so'z ikki bo'limda o'rgatilmaydi),
 * tarjima esa unitning ichki ishi.
 *
 * Fayl BOSQICHMA-BOSQICH to'ladi: unit yozilganda uning so'zlari
 * qo'shiladi. To'liq bo'lishi shart emas, ziddiyatsiz bo'lishi shart.
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
}

export interface WortlisteFile {
  level: 'A1';
  eintraege: WortEintrag[];
}
