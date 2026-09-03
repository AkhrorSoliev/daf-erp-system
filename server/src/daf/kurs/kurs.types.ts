/**
 * A1 kursining xaritasi — QO'LDA yoziladi va odam tasdiqlaydi.
 *
 * Bu fayl kontentdan OLDIN keladi: unda so'zning o'zi emas, faqat qaysi
 * bo'limga nechta so'z tushishi va u qaysi grammatikani ko'tarishi
 * yoziladi. Kontent yasashdan oldin butun kurs ko'rinib turishi kerak,
 * aks holda 64 bo'lim bir-biriga bog'lanmagan holda to'ldiriladi.
 */
export interface KursSectionSpec {
  /** Unit ichidagi tartib, 1 dan boshlanadi. */
  order: number;
  /** Barqaror kalit: `u01-s3`. Seed shu bo'yicha yangilaydi. */
  code: string;
  titleDe: string;
  titleUz: string;
  /** Bo'limning grammatika mavzusi, nemischa nomi bilan. */
  grammar: string;
  grammarUz: string;
  /** Shu bo'limga rejalashtirilgan ASOSIY so'zlar soni. */
  wordBudget: number;
}

export interface KursUnitSpec {
  order: number;
  /** Barqaror kalit: `u01`. */
  code: string;
  titleDe: string;
  titleUz: string;
  /** Unitning mavzusi — bir qatorlik tavsif. */
  theme: string;
  sections: KursSectionSpec[];
}

export interface KursFile {
  level: 'A1';
  units: KursUnitSpec[];
}
