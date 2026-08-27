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
