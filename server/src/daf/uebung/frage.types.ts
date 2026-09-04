export type FrageFormat =
  | 'WORT_UZ'
  | 'UZ_WORT'
  | 'PAAR'
  | 'ARTIKEL'
  | 'LUECKE'
  | 'SATZ_BAUEN'
  | 'SATZ_UEBERSETZEN'
  | 'REAKTION';

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
  itemType: 'WORT' | 'SATZ' | 'PHRASE';
  itemId: number;
  prompt: string;
  /** Qo'shimcha ko'rsatma yoki ko'rgazma (raqam, o'zbekcha tarjima). */
  hilfe: string | null;
  options: string[];
  richtig: string;
  akzeptiert: string[];
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
