import { msg } from "@/i18n/msg";

export type ReportLayout = "BY_SECTION" | "TABLE" | "BY_BRANCH" | "TOTAL_ONLY";
export type ReportSection =
  | "TODAY_MONEY" | "STUDENTS" | "LESSONS" | "ACTIVE_STUDENTS"
  | "DEBT" | "MONTH" | "SALARY" | "ALERTS";

// Labels and hints are `msg()` texts: draw them with `t(…)`.
export const LAYOUTS: { value: ReportLayout; label: string; hint: string }[] = [
  { value: "BY_SECTION", label: msg("Bo'lim bo'yicha"), hint: msg("Har bo'lim bir qator, filiallar ichida") },
  { value: "TABLE", label: msg("Jadvalli"), hint: msg("Filiallar ustunda; 3 tagacha filialga qulay") },
  { value: "BY_BRANCH", label: msg("Filial bo'yicha"), hint: msg("Har filial alohida blok, oxirida jami") },
  { value: "TOTAL_ONLY", label: msg("Faqat jami"), hint: msg("Filiallarga bo'lmaydi, eng qisqa") },
];

export const SECTIONS: { value: ReportSection; label: string; money: boolean }[] = [
  { value: "TODAY_MONEY", label: msg("💰 Bugungi pul"), money: true },
  { value: "STUDENTS", label: msg("👥 O'quvchilar"), money: false },
  { value: "LESSONS", label: msg("🎓 Darslar"), money: false },
  { value: "ACTIVE_STUDENTS", label: msg("👤 Faol o'quvchilar"), money: false },
  { value: "DEBT", label: msg("📌 Qarz"), money: true },
  { value: "MONTH", label: msg("📅 Oy boshidan"), money: true },
  { value: "SALARY", label: msg("💵 Ustozlar oyligi"), money: true },
  { value: "ALERTS", label: msg("🚩 Diqqat"), money: false },
];

/** 07:00, 07:30 … 23:30 — the server accepts exactly these. */
export const SEND_TIMES: string[] = Array.from({ length: 34 }, (_, i) => {
  const h = 7 + Math.floor(i / 2);
  return `${String(h).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
});
