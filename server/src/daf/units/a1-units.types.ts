/**
 * A1 bo'limlarining chegarasi — QO'LDA yoziladi.
 *
 * Avtomatik bo'lish mavzuni o'rtasidan kesadi va avtomatik sarlavha
 * o'qib bo'lmaydigan narsa beradi. Manbadagi 47 mavzuning hajmi 4 dan
 * 60 so'zgacha, ya'ni tenglashtirish odam qaroriga muhtoj.
 */
export interface A1UnitSpec {
  order: number;
  titleUz: string;
  titleDe: string;
  /** Manbadagi lug'at bo'limlarining `sourceId` lari. */
  sections: string[];
  /** Shu bo'limga biriktiriladigan grammatika sahifalari. */
  grammar: string[];
}

export interface A1UnitsFile {
  level: 'A1';
  units: A1UnitSpec[];
}
