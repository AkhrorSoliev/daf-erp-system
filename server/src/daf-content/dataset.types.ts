/**
 * Manbadan mustaqil dataset shakli. Parserlar SHU yerga yozadi — DiB'ning
 * «Kapitel» yoki ZUM'ning «Handlungsfeld» atamalari bu fayldan nariga
 * o'tmaydi. Yangi manba qo'shilganda bu tiplar o'zgarmasligi kerak; agar
 * o'zgartirish kerak bo'lsa, demak adapter o'z atamasini olib kiryapti.
 */
export type CefrLevel = 'A1.1' | 'A1.2' | 'A2.1' | 'A2.2' | 'B1';

export type SourceId = 'DIB' | 'ZUM' | 'WORT_SCHULE';

/** R2'ga ketadigan bitta fayl. Litsenziyasiz aktiv manifestga tushmaydi. */
export interface AssetRef {
  /** Manbadagi to'liq URL. */
  sourceUrl: string;
  /** R2'dagi kalit, masalan `dib/audio/voc_01_01_begr.mp3`. */
  key: string;
  kind: 'AUDIO' | 'VIDEO' | 'IMAGE' | 'PDF';
  license: string;
  attribution: string;
  /**
   * Inson o'qiy oladigan nom, manbada mavjud bo'lsagina to'ldiriladi.
   * Hozircha faqat DiB video aktivlarida (RSS sarlavhasidan) — audio uchun
   * manba sarlavha bermaydi, shuning uchun bo'sh qoldiriladi.
   */
  title?: string;
}

export interface Lexeme {
  /** Nemischa so'z yoki ibora, asl holida. */
  de: string;
  /** Inglizcha tarjima (manbadan). O'zbekcha keyinroq qo'shiladi. */
  en: string;
  sectionId: string;
  /** Quyidagilar `wort.schule` dan keladi va HAMMASI ixtiyoriy — u so'zlarning
   *  taxminan yarmini qoplaydi. Litsenziyasi CC0, DiB'niki CC BY 4.0. */
  image?: AssetRef;
  syllables?: string;
  comparative?: string;
  superlative?: string;
  synonyms?: string[];
  opposites?: string[];
  wsTopics?: string[];
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
  /**
   * Quyidagi uchtasi parser emas, `labelChapter` (level-labeler.ts) tomonidan
   * to'ldiriladi — shuning uchun ixtiyoriy: `parseChapterPage` faqat
   * grammatika bog'lanishini biladi, darajani esa yig'uvchi skript
   * (`daf-harvest.ts`) hisoblab, shu maydonlarga yozadi.
   */
  level?: CefrLevel;
  needsReview?: boolean;
  reason?: string;
}

/** Grammatika sahifasidagi dialog qatori — nemischa va inglizchasi yonma-yon. */
export interface DialogueLine {
  speaker: string;
  de: string;
  en: string;
}

/**
 * Grammatika sahifasidagi to'ldirish mashqi.
 *
 * `answer` ATAYLAB bo'sh: manba javob kalitini HTML'da bermaydi, u serverda
 * tekshiriladi. Kalitni biz to'ldiramiz, lekin u tasdiqlanishi kerak, tasdiq
 * holati esa baza tushunchasi — shuning uchun to'ldirish Faza 2 ga qoldirildi.
 */
export interface GapExercise {
  id: string;
  /** Manbada uch xil mashq formati bor — ular bir xil shaklga sig'maydi. */
  kind: 'GAP' | 'REORDER' | 'CLOZE';
  /** GAP va CLOZE: bo'sh joy `___` bilan belgilangan matn. REORDER: topshiriq matni. */
  sentenceDe: string;
  /** REORDER: tartiblanadigan tokenlar. */
  tokens?: string[];
  /** CLOZE: so'z banki, agar sahifada bo'lsa. */
  wordBank?: string[];
  /** CLOZE: matndagi bo'sh joylar soni. */
  blankCount?: number;
  answer: string | null;
  answerStatus: 'MISSING' | 'DRAFT' | 'APPROVED';
  grammarCode: string;
}

export interface GrammarPage {
  /** Grimm Grammar sahifa kodi, masalan `vi_05`. */
  code: string;
  titleDe: string;
  titleEn: string;
  level: CefrLevel | null;
  /** Inglizcha tushuntirish matni. */
  explanation: string;
  dialogue: DialogueLine[];
  audio: AssetRef[];
  exercises: GapExercise[];
}

export interface PhoneticsItem {
  id: string;
  chapter: number;
  /** Nemischa misollar matni. */
  textDe: string;
  /** Inglizcha izoh, manbada `overlib()` ichida keladi. Bo'lmasligi mumkin. */
  textEn: string;
  /** Bo'lim izohi, masalan «Listen to the alphabet…». */
  caption: string;
  audio: AssetRef;
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
  grammar: GrammarPage[];
  phonetics: PhoneticsItem[];
  /** Kurs-Paket PDF'lari — faqat R2'ga chiqadi, matni o'qilmaydi. */
  documents: AssetRef[];
}
