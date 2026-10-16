export type ReportLayout = "BY_SECTION" | "TABLE" | "BY_BRANCH" | "TOTAL_ONLY";
export type ReportSection =
  | "TODAY_MONEY" | "STUDENTS" | "LESSONS" | "ACTIVE_STUDENTS"
  | "DEBT" | "MONTH" | "SALARY" | "ALERTS";

export const LAYOUTS: { value: ReportLayout; label: string; hint: string }[] = [
  { value: "BY_SECTION", label: "Bo'lim bo'yicha", hint: "Har bo'lim bir qator, filiallar ichida" },
  { value: "TABLE", label: "Jadval", hint: "Filiallar ustunda; 3 tagacha filialga qulay" },
  { value: "BY_BRANCH", label: "Filial bo'yicha", hint: "Har filial alohida blok, oxirida jami" },
  { value: "TOTAL_ONLY", label: "Faqat jami", hint: "Filiallarga bo'lmaydi, eng qisqa" },
];

export const SECTIONS: { value: ReportSection; label: string; money: boolean }[] = [
  { value: "TODAY_MONEY", label: "💰 Bugungi pul", money: true },
  { value: "STUDENTS", label: "👥 O'quvchilar", money: false },
  { value: "LESSONS", label: "🎓 Darslar", money: false },
  { value: "ACTIVE_STUDENTS", label: "👤 Faol o'quvchilar", money: false },
  { value: "DEBT", label: "📌 Qarz", money: true },
  { value: "MONTH", label: "📅 Oy boshidan", money: true },
  { value: "SALARY", label: "💵 Ustozlar oyligi", money: true },
  { value: "ALERTS", label: "🚩 Diqqat", money: false },
];

/** 07:00, 07:30 … 23:30 — the server accepts exactly these. */
export const SEND_TIMES: string[] = Array.from({ length: 34 }, (_, i) => {
  const h = 7 + Math.floor(i / 2);
  return `${String(h).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
});
