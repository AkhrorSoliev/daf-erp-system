import type { LeadStatus } from "@/hooks/use-leads-board";

/** Server `submission-stage.ts` bilan bir xil. Bosqichni client hisoblamaydi. */
export type SubmissionStage = "awaiting" | "contacted" | "converted" | "lost";

export const SUBMISSION_STAGES: readonly SubmissionStage[] = [
  "awaiting",
  "contacted",
  "converted",
  "lost",
];

export const STAGE_LABELS: Record<SubmissionStage, string> = {
  awaiting: "Qo'ng'iroq kutmoqda",
  contacted: "Aloqada",
  converted: "O'quvchi bo'ldi",
  lost: "Yo'qotildi",
};

export const STAGE_HINTS: Record<SubmissionStage, string> = {
  awaiting: "Hali hech kim qo'ng'iroq qilmagan yangi lidlar",
  contacted: "Qo'ng'iroq qilingan yoki sinov darsidagi lidlar",
  converted: "O'quvchiga aylangan lidlar",
  lost: "Yo'qotilgan yoki arxivlangan lidlar",
};

/** `?source=` da manbasi yo'q javoblar (server `NO_SOURCE_TOKEN`). */
export const NO_SOURCE_TOKEN = "none";

export type AnswerValue = string | number | boolean;

export interface SubmissionFieldColumn {
  id: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
}

export interface SubmissionCaller {
  id: number;
  firstName: string;
  lastName: string;
}

export interface SubmissionLead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  statusEnum: LeadStatus;
  archived: boolean;
  calledAt: string | null;
  calledBy: SubmissionCaller | null;
  convertedStudentId: number | null;
  lostReason: string | null;
  source: { id: string; name: string } | null;
}

export interface SubmissionRow {
  id: string;
  submittedAt: string;
  data: Record<string, AnswerValue>;
  stage: SubmissionStage;
  isRepeat: boolean;
  submitted: { firstName: string; lastName: string; phone: string };
  lead: SubmissionLead | null;
}

export interface SubmissionSourceCount {
  id: string | null;
  name: string | null;
  count: number;
}

export interface SubmissionCounts {
  stages: Record<SubmissionStage, number>;
  sources: SubmissionSourceCount[];
}

export interface SubmissionsResponse {
  data: SubmissionRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: SubmissionCounts;
  fields: SubmissionFieldColumn[];
  legacyFields: SubmissionFieldColumn[];
}

export type SubmissionsExport = Pick<
  SubmissionsResponse,
  "data" | "fields" | "legacyFields"
>;
