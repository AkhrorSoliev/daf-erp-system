export type FrageFormat =
  | 'WORT_UZ'
  | 'UZ_WORT'
  | 'PAAR'
  | 'ARTIKEL'
  | 'LUECKE'
  | 'SATZ_BAUEN'
  | 'SATZ_UEBERSETZEN'
  | 'REAKTION'
  | 'ZUORDNEN'
  | 'DIALOG_LUECKE';

export interface MaterialWort {
  id: number;
  de: string;
  uz: string;
  artikel: string | null;
  /** Raqam yoki belgi — so'zning yonida ko'rsatiladi, so'ralmaydi. */
  anzeige: string | null;
  sectionCode: string;
}

export interface MaterialSatz {
  id: number;
  de: string;
  uz: string;
  sectionCode: string;
}

export interface MaterialPhrase {
  id: number;
  funktionUz: string;
  de: string;
  uz: string;
  sectionCode: string;
}

/** Dialog ichidagi bitta satr — `dialogLuecke` chalg'ituvchi puli sifatida ham ishlatiladi. */
export interface MaterialDialogZeile {
  id: number;
  sprecher: string;
  de: string;
  uz: string;
}

/** Butun dialog — bitta satri bo'shatilib, savolga aylanadi (`DIALOG_LUECKE`). */
export interface MaterialDialog {
  id: number;
  titelDe: string;
  zeilen: MaterialDialogZeile[];
  sectionCode: string;
}

/**
 * Serverdagi to'liq savol — TO'G'RI JAVOB BILAN.
 *
 * `itemType` va `itemId` — savolning o'zligi. Javob kelganda server
 * savolni QAYTA QURMAYDI (dizayn D7): u shu ikki maydon bo'yicha
 * materialni bazadan o'qiydi va to'g'ri javobni qaytadan hisoblaydi.
 * Sabab: qaytariladigan so'zlar har o'quvchida boshqacha, ya'ni savolni
 * qayta qurish uchun kerak bo'ladigan urug' beqaror.
 */
export interface Frage {
  format: FrageFormat;
  itemType: 'WORT' | 'SATZ' | 'PHRASE' | 'DIALOGZEILE';
  itemId: number;
  prompt: string;
  /** Qo'shimcha ko'rsatma yoki ko'rgazma (raqam, o'zbekcha tarjima). */
  hilfe: string | null;
  options: string[];
  richtig: string;
  akzeptiert: string[];
  /**
   * Shu savol "ishlatib qo'yadigan" barcha material kalitlari
   * (`materialSchluessel` shaklida).
   *
   * Ko'pchilik format bitta so'z/gap/iboraga tegishli bo'lgani uchun
   * bu odatda bitta elementli massiv — `itemType:itemId` bilan bir xil.
   * `PAAR` BUNDAN MUSTASNO: u to'rtta so'zni bittada ko'rsatadi va
   * tarjimasini oshkor qiladi, shuning uchun to'rttasini ham shu yerga
   * yozadi. Seans quruvchisi (`baueSeans`) shu ro'yxatga qarab so'z
   * qayta so'ralmasligini ta'minlaydi — faqat `itemType:itemId`ga
   * qaraganda, `PAAR` ichidagi qolgan uch so'z "band" bo'lib qolmas
   * edi va bir seansda ikkinchi marta (masalan alohida savol sifatida)
   * so'ralishi mumkin bo'lardi.
   */
  belegteItems: string[];
}

/** `belegteItems`/seans ichidagi band material kalitini quradi. */
export function materialSchluessel(
  itemType: Frage['itemType'],
  itemId: number,
): string {
  return `${itemType}:${itemId}`;
}

/** Mijozga ketadigan savol — to'g'ri javobsiz. */
export interface PublicFrage {
  index: number;
  format: FrageFormat;
  itemType: Frage['itemType'];
  itemId: number;
  prompt: string;
  hilfe: string | null;
  options: string[];
}

export function toPublic(f: Frage, index: number): PublicFrage {
  return {
    index,
    format: f.format,
    itemType: f.itemType,
    itemId: f.itemId,
    prompt: f.prompt,
    hilfe: f.hilfe,
    options: f.options,
  };
}
