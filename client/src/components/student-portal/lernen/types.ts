// Server javoblarining shakli. Bu yerda TO'G'RI JAVOB YO'Q va bo'lmasligi
// kerak: u faqat urinishdan keyin, `AttemptResult` ichida keladi. Mijozga
// oldindan yuborilsa, uni brauzerning tarmoq oynasida ko'rish mumkin bo'lardi.

export type DafLevel = "A1_1" | "A1_2" | "A2_1" | "A2_2" | "B1";
export type DafLessonKind = "VOCAB" | "GRAMMAR";
export type DafExerciseKind = "GAP" | "MC" | "CLOZE" | "REORDER" | "FREE_WRITE";
export type DafAnswerStatus = "FROM_SOURCE" | "PARTIAL" | "OPEN";

export interface LernenUnitSummary {
  id: number;
  order: number;
  titleUz: string;
  titleDe: string;
  lessonCount: number;
}

export interface LernenLevel {
  level: DafLevel;
  label: string;
  units: LernenUnitSummary[];
}

export interface LernenLessonSummary {
  id: number;
  order: number;
  kind: DafLessonKind;
  titleDe: string;
  titleUz: string | null;
  wordCount: number;
  exerciseCount: number;
}

export interface LernenUnit {
  id: number;
  level: DafLevel;
  label: string;
  order: number;
  titleUz: string;
  titleDe: string;
  lessons: LernenLessonSummary[];
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
  kind: DafLessonKind;
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
