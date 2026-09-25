export interface SubjectRow {
  name: string;
  /** Raw string from the input; converted to Number on submit. */
  maxScore: string;
  /** Per-subject pass threshold; bo'sh bo'lsa null jo'natiladi. */
  passingScore: string;
}

export interface FormValues {
  title: string;
  description: string;
  examDate: Date | null;
  /** Offered exam times ("HH:mm"); the first is the primary session. */
  examTimes: string[];
  registrationDate: Date | null;
  registrationTime: string;
  /** Raw digits — PriceInput strips separators internally. */
  price: string;
  /** Discounted price for DaF students; empty = they pay the full price. */
  studentPrice: string;
  /** CEFR levels offered (empty = no level step in the bot). */
  offeredLevels: string[];
  subjects: SubjectRow[];
}

export const DEFAULT_SUBJECT_ROW: SubjectRow = {
  name: "",
  maxScore: "100",
  passingScore: "60",
};

// DaF Sprachzentrum standart 4 nemis tili bo'limi (Goethe B1+ modular
// formati: har bo'lim 100 dan, o'tish 60). Har imtihon yaratilganda
// boshlang'ich holat sifatida ko'rsatiladi. Admin keraksizini o'chirib,
// ballarni moslay oladi.
export const DEFAULT_GERMAN_SUBJECTS: SubjectRow[] = [
  { name: "Lesen", maxScore: "100", passingScore: "60" },
  { name: "Hören", maxScore: "100", passingScore: "60" },
  { name: "Schreiben", maxScore: "100", passingScore: "60" },
  { name: "Sprechen", maxScore: "100", passingScore: "60" },
];

/** Yangi imtihon formasining boshlang'ich qiymatlari. */
export function emptyExamForm(): FormValues {
  return {
    title: "",
    description: "",
    examDate: null,
    examTimes: ["10:00"],
    registrationDate: null,
    registrationTime: "09:00",
    price: "",
    studentPrice: "",
    offeredLevels: [],
    subjects: DEFAULT_GERMAN_SUBJECTS.map((s) => ({ ...s })),
  };
}
