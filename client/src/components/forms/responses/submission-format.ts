import { format, isSameDay, subDays } from "date-fns";
import { formatPhone } from "@/lib/format-utils";
import {
  STAGE_LABELS,
  type AnswerValue,
  type SubmissionCaller,
  type SubmissionFieldColumn,
  type SubmissionRow,
  type SubmissionsExport,
  type SubmissionsResponse,
} from "./types";

/** «Bugun, 14:05» — admin «bu bugungi story'danmi?» degan savolga tez javob oladi. */
export function formatSubmittedAt(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = format(date, "HH:mm");
  if (isSameDay(date, now)) return `Bugun, ${time}`;
  if (isSameDay(date, subDays(now, 1))) return `Kecha, ${time}`;
  return format(date, "dd.MM.yyyy, HH:mm");
}

export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 9 ? `tel:+998${digits}` : `tel:+${digits}`;
}

/** Lid bo'lsa uning joriy ismi, lid butunlay o'chirilgan bo'lsa formaga yozilgani. */
export function displayName(row: SubmissionRow): string {
  const source = row.lead ?? row.submitted;
  return `${source.firstName} ${source.lastName}`.trim() || "—";
}

export function displayPhone(row: SubmissionRow): string {
  return row.lead?.phone ?? row.submitted.phone;
}

export function answerText(
  column: SubmissionFieldColumn,
  value: AnswerValue | undefined,
): string {
  if (value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Ha" : "Yo'q";
  const option = column.options?.find((o) => o.value === value);
  return option ? option.label : String(value);
}

/**
 * Qo'ng'iroq belgisini bitta qatorga qo'llaydi va bosqich sanoqlarini
 * moslaydi. Server qayta so'ralmaydi, shuning uchun «Qo'ng'iroq kutmoqda»
 * filtrida belgilangan qator ro'yxatdan sakrab ketmaydi.
 */
export function withCalled(
  response: SubmissionsResponse,
  rowId: string,
  calledAt: string | null,
  calledBy: SubmissionCaller | null,
): SubmissionsResponse {
  const target = response.data.find((r) => r.id === rowId);
  if (!target?.lead) return response;
  const nextStage = stageAfterCall(target, calledAt);
  const stages = { ...response.counts.stages };
  if (nextStage !== target.stage) {
    stages[target.stage] -= 1;
    stages[nextStage] += 1;
  }
  return {
    ...response,
    counts: { ...response.counts, stages },
    data: response.data.map((r) =>
      r.id === rowId && r.lead
        ? { ...r, stage: nextStage, lead: { ...r.lead, calledAt, calledBy } }
        : r,
    ),
  };
}

// Faqat «kutmoqda» ↔ «aloqada» o'tadi. O'quvchi bo'lgan, yo'qotilgan yoki
// sinovdagi lidning bosqichini qo'ng'iroq belgisi o'zgartirmaydi.
function stageAfterCall(
  row: SubmissionRow,
  calledAt: string | null,
): SubmissionRow["stage"] {
  if (row.stage === "awaiting" && calledAt) return "contacted";
  if (row.stage === "contacted" && !calledAt && row.lead?.statusEnum === "NEW") {
    return "awaiting";
  }
  return row.stage;
}

const CSV_HEADERS = [
  "Ism",
  "Familiya",
  "Telefon",
  "Manba",
  "Yuborildi",
  "Bosqich",
  "Qo'ng'iroq qilingan sana",
];

const PHONE_LIKE = /^\+?\d[\d ]*$/;

/**
 * Excel `=`, `+`, `-`, `@` bilan boshlangan katakni formula deb o'qiydi.
 * Javoblar ommaviy formadan keladi, shuning uchun bunday matn oldiga `'`
 * qo'yiladi. Telefon raqami bundan mustasno.
 */
export function csvCell(value: string): string {
  const guarded =
    /^[=+\-@\t\r]/.test(value) && !PHONE_LIKE.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function buildSubmissionsCsv(exp: SubmissionsExport): string {
  const extra = [...exp.fields, ...exp.legacyFields];
  const header = [...CSV_HEADERS, ...extra.map((f) => f.label)];
  const lines = exp.data.map((row) => {
    const person = row.lead ?? row.submitted;
    const phone = displayPhone(row);
    return [
      person.firstName,
      person.lastName,
      phone ? formatPhone(phone) : "",
      row.lead?.source?.name ?? "",
      format(new Date(row.submittedAt), "dd.MM.yyyy HH:mm"),
      STAGE_LABELS[row.stage],
      row.lead?.calledAt ? format(new Date(row.lead.calledAt), "dd.MM.yyyy HH:mm") : "",
      ...extra.map((f) => answerText(f, row.data[f.id])),
    ];
  });
  return (
    "\uFEFF" +
    [header, ...lines].map((cells) => cells.map(csvCell).join(",")).join("\r\n")
  );
}

export function submissionsCsvFileName(title: string, now: Date): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "forma"}-javoblar-${format(now, "yyyy-MM-dd")}.csv`;
}
