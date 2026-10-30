/**
 * `GET /daf/media/lessons/:id/fragen` javobi — server:
 * `DafMediaFragenService.lessonFragen` / `UebungService.vorschauKandidaten`
 * (`VorschauFrage`). Mijoz serverning
 * `frage.types.ts`ni import qila olmaydi, shuning uchun shakl shu yerda
 * bir xil nomlar bilan qaytadan e'lon qilinadi — xuddi `media-inhalt-types.ts`
 * server `SectionInhalt`ni qaytadan e'lon qilgani kabi.
 */

import type { MediaLessonKind } from "./media-coverage-types";

export type FrageFormat =
  | "WORT_UZ"
  | "UZ_WORT"
  | "PAAR"
  | "ARTIKEL"
  | "LUECKE"
  | "SATZ_BAUEN"
  | "SATZ_HOEREN"
  | "SATZ_UEBERSETZEN"
  | "REAKTION"
  | "ZUORDNEN"
  | "DIALOG_LUECKE"
  | "AUDIO_WORT"
  | "WORT_TIPPEN"
  | "HOEREN_WAHL"
  | "LESEN_WAHL"
  | "BILD_WORT"
  | "AUDIO_BILD"
  | "BILD_TIPPEN"
  | "UHR_LESEN"
  | "UHR_HOEREN"
  | "UHR_TIPPEN";

/**
 * Bu — mijozga (CEO ko'rigi) ketadigan savol, TO'G'RI JAVOB BILAN.
 * `/media` CEO/Filial direktori/Administrator bilan chegaralangan
 * (studentlar kira olmaydi), shuning uchun javobni shu yerda ko'rsatish
 * xavfsiz — bu ro'yxatning butun maqsadi shu.
 */
export interface VorschauFrage {
  format: FrageFormat;
  itemType: "WORT" | "SATZ" | "PHRASE" | "DIALOGZEILE" | "HOERFRAGE" | "UHRZEIT";
  itemId: number;
  prompt: string;
  hilfe: string | null;
  options: string[];
  richtig: string;
  titel?: string | null;
  audioUrl: string | null;
  /**
   * `BILD_TIPPEN`: the picture the student types from. In `BILD_WORT` and
   * `AUDIO_BILD` the pictures are the `options` (URLs) instead.
   */
  bildUrl?: string | null;
  /** `UHR_LESEN` / `UHR_TIPPEN`: the clock shown (`HH:MM`). */
  uhrzeit?: string | null;
}

/** `GET /daf/media/lessons/:id/fragen` javobi. */
export interface LessonFragen {
  kind: MediaLessonKind | null;
  /** Bitta seansda beriladigan savollar soni. */
  laenge: number;
  /** Shu seans turida oldinroq chiqadigan formatlar. */
  bevorzugt: FrageFormat[];
  fragen: VorschauFrage[];
}

/** Ekrandagi savol + player navbatidagi barqaror kaliti. */
export interface KalitliFrage extends VorschauFrage {
  kalit: string;
}
