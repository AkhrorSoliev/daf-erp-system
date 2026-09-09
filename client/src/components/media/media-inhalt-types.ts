/**
 * `GET /daf/media/sections/:id/inhalt` javobi — bitta bo'limning to'liq
 * materiali (server: `daf-media-inhalt.service.ts`). `media-coverage-types.ts`
 * dan farqi: u sonlarni ("nechta") beradi, bu esa o'sha sonlar ortidagi
 * so'z/gap/ibora/dialogning O'ZINI — audio manzillari bilan birga.
 */

/** Bo'lim so'zi — audio va rasm ikkalasi ham to'liq manzilga aylantirilgan. */
export interface InhaltWort {
  id: number;
  de: string;
  uz: string | null;
  artikel: string | null;
  anzeige: string | null;
  /**
   * `false` — dvigatel bu so'zdan hech qachon savol tuzmaydi va uni
   * chalg'ituvchi sifatida ham ishlatmaydi, lekin kontentning bir qismi:
   * ro'yxatdan olib tashlanmaydi, faqat shu bayroq bilan belgilanadi.
   */
  core: boolean;
  picturable: boolean;
  audioUrl: string | null;
  imageUrl: string | null;
}

/** Gap yoki ibora qatori — ikkalasi ham faqat audio tashiydi. */
export interface InhaltZeile {
  id: number;
  de: string;
  uz: string;
  audioUrl: string | null;
  /** Faqat iboralarda bor — gapda `undefined`. */
  funktion?: string;
  funktionUz?: string;
}

/** Dialog satri — o'z sectionId'siga ega emas, DafDialog orqali keladi. */
export interface InhaltDialogZeile {
  id: number;
  dialogId: number;
  order: number;
  sprecher: string;
  de: string;
  uz: string;
  audioUrl: string | null;
}

export interface SectionInhalt {
  woerter: InhaltWort[];
  saetze: InhaltZeile[];
  phrasen: InhaltZeile[];
  dialogZeilen: InhaltDialogZeile[];
}
