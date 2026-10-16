import api from "@/lib/api";
import type { ReportLayout, ReportSection } from "./telegram-report-labels";

export interface Recipient {
  id: number;
  userId: number;
  name: string;
  position: string | null;
  sendTime: string;
  layout: ReportLayout;
  allBranches: boolean;
  branchIds: number[];
  sections: ReportSection[];
  isActive: boolean;
  lastSentDate: string | null;
  telegramLinked: boolean;
  noBranch: boolean;
}
export interface BranchOption { id: number; name: string }
export interface Candidate { id: number; name: string; position: string | null }
export type RecipientPatch = Partial<Pick<Recipient, "sendTime" | "layout" | "allBranches" | "branchIds" | "sections" | "isActive">>;

export const fetchRecipients = async () =>
  (await api.get<{ recipients: Recipient[]; branches: BranchOption[] }>("/telegram-report/recipients")).data;
export const fetchCandidates = async () => (await api.get<Candidate[]>("/telegram-report/candidates")).data;
export const addRecipient = async (userId: number) => (await api.post<Recipient>("/telegram-report/recipients", { userId })).data;
export const patchRecipient = async (id: number, patch: RecipientPatch) =>
  (await api.patch<Recipient>(`/telegram-report/recipients/${id}`, patch)).data;
export const removeRecipient = async (id: number) => (await api.delete(`/telegram-report/recipients/${id}`)).data;
export const testRecipient = async (id: number) => (await api.post<{ sent: true }>(`/telegram-report/recipients/${id}/test`)).data;
