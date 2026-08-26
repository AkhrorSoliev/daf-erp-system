/**
 * Manbadan mustaqil dataset shakli. Parserlar SHU yerga yozadi — DiB'ning
 * «Kapitel» yoki ZUM'ning «Handlungsfeld» atamalari bu fayldan nariga
 * o'tmaydi. Yangi manba qo'shilganda bu tiplar o'zgarmasligi kerak; agar
 * o'zgartirish kerak bo'lsa, demak adapter o'z atamasini olib kiryapti.
 */
export type CefrLevel = 'A1.1' | 'A1.2' | 'A2.1' | 'A2.2' | 'B1';

export type SourceId = 'DIB' | 'ZUM';

/** R2'ga ketadigan bitta fayl. Litsenziyasiz aktiv manifestga tushmaydi. */
export interface AssetRef {
  /** Manbadagi to'liq URL. */
  sourceUrl: string;
  /** R2'dagi kalit, masalan `dib/audio/voc_01_01_begr.mp3`. */
  key: string;
  kind: 'AUDIO' | 'VIDEO' | 'IMAGE' | 'PDF';
  license: string;
  attribution: string;
}

export interface Lexeme {
  /** Nemischa so'z yoki ibora, asl holida. */
  de: string;
  /** Inglizcha tarjima (manbadan). O'zbekcha keyinroq qo'shiladi. */
  en: string;
  sectionId: string;
}

/** Lug'atning bitta mavzuli bo'limi — DiB'da har biriga bitta mp3 to'g'ri keladi. */
export interface LexemeSection {
  id: string;
  chapter: number;
  titleDe: string;
  titleEn: string;
  audio: AssetRef | null;
  entries: Lexeme[];
}

export interface Transcript {
  /** DiB fayl nomi, masalan `01_02_int_ag_who`. */
  id: string;
  chapter: number;
  titleDe: string;
  /** Nemischa qatorlar, ketma-ketligi saqlangan. Vaqt belgisi YO'Q. */
  linesDe: string[];
  /** Inglizcha qatorlar. `linesDe` bilan bir xil uzunlikda bo'lishi SHART emas. */
  linesEn: string[];
  video: AssetRef | null;
}

export interface ChapterInfo {
  chapter: number;
  /** Grimm Grammar sahifa kodlari, masalan `vi_05`. */
  grammarFocus: string[];
  grammarRecommended: string[];
}

export interface DafDataset {
  source: SourceId;
  /** Yig'ilgan sana, ISO. Skript beradi — parser emas. */
  harvestedAt: string;
  license: string;
  attribution: string;
  chapters: ChapterInfo[];
  sections: LexemeSection[];
  transcripts: Transcript[];
  /**
   * Manbadagi HAR BIR video, transkripti bor-yo'qligidan qat'i nazar.
   * Transkript faqat intervyu videolarini qamrab oladi — `sik` (Sprache im
   * Kontext) va `intro` videolari manba saytida umuman boshqa sahifaga
   * (`vid.php`, transkript panelisiz) yo'naltiriladi. Shuning uchun video
   * `Transcript.video` orqali EMAS, shu ro'yxat orqali kuzatiladi — aks
   * holda transkriptsiz videolar media manifestga hech qachon tushmay,
   * R2'ga chiqmay qolardi.
   */
  videos: AssetRef[];
}
