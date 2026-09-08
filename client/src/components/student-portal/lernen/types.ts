// Server javoblarining shakli. Bu yerda TO'G'RI JAVOB YO'Q va bo'lmasligi
// kerak: u faqat urinishdan keyin, `AttemptResult` ichida keladi. Mijozga
// oldindan yuborilsa, uni brauzerning tarmoq oynasida ko'rish mumkin bo'lardi.

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

export type MaterialTyp = "WORT" | "SATZ" | "PHRASE" | "DIALOGZEILE";

/** Serverdan kelgan savol. To'g'ri javob bu yerda YO'Q. */
export interface PublicFrage {
  index: number;
  format: FrageFormat;
  itemType: MaterialTyp;
  itemId: number;
  prompt: string;
  hilfe: string | null;
  options: string[];
  /**
   * Qisqa sarlavha — hozircha faqat `DIALOG_LUECKE` to'ldiradi (dialog
   * nomi). Natija ekrani xato ro'yxatida BUTUN suhbat (`prompt`) o'rniga
   * shu qisqa nomni ko'rsatadi (ko'rik topilmasi). Boshqa formatlarda
   * `undefined`.
   */
  titel?: string | null;
  /**
   * Aytilgan so'zning R2 kaliti — faqat `AUDIO_WORT`/`WORT_TIPPEN`da
   * `null`dan farqli. `prompt` bu ikkisida ATAYLAB BO'SH: so'zning o'zi
   * javob, uni promptga yozsa tinglash mashqi o'qish mashqiga aylanardi.
   */
  audioUrl: string | null;
}

/** Javob tekshirilgandan KEYIN keladi — faqat shunda to'g'ri javob ma'lum. */
export interface PruefErgebnis {
  isCorrect: boolean;
  richtig: string;
}

/**
 * Jonli juftlash mashqida BITTA juftni tekshirish javobi.
 *
 * `PruefErgebnis`dan ATAYLAB tor: `richtig` (to'g'ri javob matni) yo'q —
 * server buni hech qachon yubormaydi, chunki bitta juft tekshirilganda
 * qolgan juftlarning javobi hali oshkor bo'lmasligi kerak.
 */
export interface JuftNatija {
  isCorrect: boolean;
}

export interface AbschlussErgebnis {
  bestScore: number;
  runs: number;
}

/**
 * Uchta daraja — backend `DafLevel` enumi (`schema.prisma`) bilan bir xil.
 * Eski `A1_1`/`A1_2` bo'linishi manbaning yorlig'i edi; A1 migratsiyasi
 * uni bitta `A1`ga birlashtirdi (`LEVEL_ORDER`, `daf-portal-read.service.ts`).
 */
export type DafLevel = "A1" | "A2" | "B1";
/**
 * Seans turi — A1 kurs xaritasidagi bosqich. Eski nom (`VOCAB`/`GRAMMAR`)
 * darsning MAVZUSINI bildirardi va grammatikani mashqdan uzib qo'yardi;
 * server enumi (`schema.prisma`) allaqachon shu to'rttasiga o'tgan.
 * `null` — eski DiB darsi, unda seans turi umuman yo'q.
 */
export type DafLessonKind = "SECTION_A" | "SECTION_B" | "BRIDGE" | "UNIT_TEST";
export type DafExerciseKind = "GAP" | "MC" | "CLOZE" | "REORDER" | "FREE_WRITE";
export type DafAnswerStatus = "FROM_SOURCE" | "PARTIAL" | "OPEN";

export interface LernenUnitSummary {
  id: number;
  order: number;
  titleUz: string;
  titleDe: string;
  lessonCount: number;
  /** Shu o'quvchi shu unitda tugatgan seanslar soni. */
  doneCount: number;
}

/**
 * `getLevels` javobidagi unit — endi bo'lim ichida sarlab boradi.
 *
 * Yo'l zigzagida har seans o'z tugunini oladi, shuning uchun bu javob
 * ham bo'lim ekrani bilan bir xil `sections`/`finalTest` shaklini oladi
 * — `yolTugunlari` shu ikkisidan tugunlarni quradi. `LernenUnitSummary`ni
 * KENGAYTIRADI, uni takrorlamaydi: `sections`/`finalTest` faqat yo'lga
 * kerak, unit haqidagi minimal ma'lumot (`id`/`titleUz`/`lessonCount`/
 * `doneCount`) esa boshqa joyda ham ishlatiladigan asosiy shakl bo'lib
 * qoladi.
 */
export interface LernenLevelUnit extends LernenUnitSummary {
  sections: LernenSectionGroup[];
  finalTest: LernenSeans | null;
}

export interface LernenLevel {
  level: DafLevel;
  label: string;
  units: LernenLevelUnit[];
}

/** Unit ichidagi bitta seans — yangi A1 xaritasi ham, eski DiB darsi ham. */
export interface LernenSeans {
  id: number;
  order: number;
  kind: DafLessonKind | null;
  titleDe: string;
  titleUz: string | null;
  wordCount: number;
  exerciseCount: number;
  completedAt: string | null;
  bestScore: number;
  runs: number;
}

/** Unit ichidagi MAVZULI bo'lim — o'z sahifasi yo'q, faqat sarlavha. */
export interface LernenSectionGroup {
  id: number;
  order: number;
  code: string;
  titleUz: string;
  titleDe: string;
  lessons: LernenSeans[];
}

export interface LernenUnit {
  id: number;
  level: DafLevel;
  label: string;
  order: number;
  titleUz: string;
  titleDe: string;
  /**
   * Yassi ro'yxat — eski DiB unitlarida (`sections` bo'sh) shu yerdan
   * o'qiladi. Yangi A1 unitlarida `sections.flatMap` + `finalTest` bilan
   * bir xil to'plam, faqat guruhlanmagan.
   */
  lessons: LernenSeans[];
  sections: LernenSectionGroup[];
  finalTest: LernenSeans | null;
}

export interface LernenLexeme {
  id: number;
  de: string;
  uz: string | null;
  audioUrl: string | null;
  /**
   * So'zning fayl ICHIDAGI oralig'i. Manbadagi mp3 butun bo'limni
   * o'qiydi, shuning uchun usiz tugma o'ntacha so'zni ketma-ket
   * eshittirardi.
   */
  audioStartMs: number | null;
  audioEndMs: number | null;
  imageUrl: string | null;
}

export interface LernenExercise {
  id: number;
  kind: DafExerciseKind;
  prompt: string;
  options: string[];
  answerStatus: DafAnswerStatus;
}

export interface LernenLesson {
  id: number;
  order: number;
  /** Eski DiB darsida seans turi yo'q — `null`. */
  kind: DafLessonKind | null;
  titleDe: string;
  titleUz: string | null;
  label: string;
  unit: { id: number; titleUz: string; level: DafLevel };
  grammar: {
    id: number;
    code: string;
    titleDe: string;
    titleUz: string | null;
    explanationUz: string | null;
    explanationEn: string;
  } | null;
  lexemes: LernenLexeme[];
  exercises: LernenExercise[];
}

export interface LernenGrammarItem {
  id: number;
  code: string;
  titleDe: string;
  titleUz: string | null;
  level: DafLevel | null;
  /** Yo'lda ko'rinadimi — `false` bo'lsa faqat grammatika ro'yxatidan. */
  inPath: boolean;
  exerciseCount: number;
}

/** Yo'l tepasidagi chiplar uchun umumiy ilgarilash. */
export interface Fortschritt {
  gesamt: number;
  /** `ab` — shu darajaning pastki chegarasi, `naechsteStufe.ab` bilan simmetrik. */
  stufe: { de: string; uz: string; ab: number };
  /** Eng yuqori darajada `null` — undan keyin daraja yo'q. */
  naechsteStufe: { de: string; uz: string; ab: number } | null;
  serie: number;
  wochePunkte: number;
  /** Guruhi yo'q yoki guruh ro'yxati bo'sh bo'lsa `null`. */
  wochePlatzGruppe: number | null;
  wochePlatzZentrum: number;
  /**
   * Bugun MUDDATI KELGAN so'zlar soni — Takrorlash tugmasi shu songa
   * qarab faol/xira bo'ladi (dizayn §4). Nol bo'lsa tugma "bugun
   * takrorlanadigan so'z yo'q" deb bosilmay qoladi.
   */
  faelligeWoerter: number;
}

/** Reyting jadvalidagi bitta qator. */
export interface ReytingZeile {
  studentId: number;
  name: string;
  punkte: number;
  platz: number;
  /** Shu qator so'rovni yuborgan o'quvchining o'zimi. */
  selbst: boolean;
}

export interface AttemptResult {
  isCorrect: boolean;
  /** To'g'ri javob — FAQAT urinishdan keyin keladi. */
  correctAnswers: (string | null)[];
}

export type DrillKind = "AUDIO_TO_WORD" | "WORD_TO_UZ" | "UZ_TO_WORD";

/**
 * Dars mashqi — TO'G'RI JAVOBSIZ.
 *
 * Javob serverda qoladi va faqat tekshirishdan keyin `DrillResult` ichida
 * keladi. Mijozga oldindan yuborilsa, uni brauzerning tarmoq oynasida
 * ko'rish mumkin bo'lardi.
 */
export interface DrillQuestion {
  index: number;
  kind: DrillKind;
  prompt: string;
  options: string[];
  /** Tinglash savolida: fayl manzili va faqat shu so'zning oralig'i. */
  audio: { url: string; startMs: number; endMs: number } | null;
}

export interface DrillResult {
  isCorrect: boolean;
  answer: string;
}
