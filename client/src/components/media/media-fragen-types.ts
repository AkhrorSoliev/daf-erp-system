/**
 * `GET /daf/media/sections/:id/fragen` javobi — server:
 * `daf-media-fragen.service.ts` (`VorschauFrage`). Mijoz serverning
 * `frage.types.ts`ni import qila olmaydi, shuning uchun shakl shu yerda
 * bir xil nomlar bilan qaytadan e'lon qilinadi — xuddi `media-inhalt-types.ts`
 * server `SectionInhalt`ni qaytadan e'lon qilgani kabi.
 */

export type FrageFormat =
  | "WORT_UZ"
  | "UZ_WORT"
  | "PAAR"
  | "ARTIKEL"
  | "LUECKE"
  | "SATZ_BAUEN"
  | "SATZ_UEBERSETZEN"
  | "REAKTION"
  | "ZUORDNEN"
  | "DIALOG_LUECKE"
  | "AUDIO_WORT"
  | "WORT_TIPPEN";

/**
 * Bu — mijozga (CEO ko'rigi) ketadigan savol, TO'G'RI JAVOB BILAN.
 * `/media` CEO/Filial direktori/Administrator bilan chegaralangan
 * (studentlar kira olmaydi), shuning uchun javobni shu yerda ko'rsatish
 * xavfsiz — bu ro'yxatning butun maqsadi shu.
 */
export interface VorschauFrage {
  format: FrageFormat;
  itemType: "WORT" | "SATZ" | "PHRASE" | "DIALOGZEILE";
  itemId: number;
  prompt: string;
  hilfe: string | null;
  options: string[];
  richtig: string;
  titel?: string | null;
  audioUrl: string | null;
}
