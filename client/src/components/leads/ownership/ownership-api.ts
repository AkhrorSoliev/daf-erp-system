import api from "@/lib/api";
import type { LeadCard } from "@/hooks/use-leads-board";

/** The routes of `LeadOwnershipController` (ADR-0093). */
export async function claimLead(id: string): Promise<LeadCard> {
  return (await api.post<LeadCard>(`/leads/${id}/claim`)).data;
}

export async function releaseLead(id: string): Promise<LeadCard> {
  return (await api.post<LeadCard>(`/leads/${id}/release`)).data;
}

export async function assignLead(id: string, userId: number | null): Promise<LeadCard> {
  return (await api.patch<LeadCard>(`/leads/${id}/owner`, { userId })).data;
}

export interface AssignableStaff {
  id: number;
  firstName: string;
  lastName: string;
  photo: string | null;
}

export async function fetchAssignable(leadId: string): Promise<AssignableStaff[]> {
  return (
    await api.get<AssignableStaff[]>("/leads/ownership/assignable", { params: { leadId } })
  ).data;
}

export interface OwnerSummaryRow {
  userId: number;
  name: string;
  held: number;
  untouched: number;
  /** Leads taken in the period, each lead once. */
  taken: number;
  /** Leads the system took back in the period, each lead once. */
  expired: number;
  /** Leads of this person that became students in the period. */
  converted: number;
}

export type OwnershipPeriod = "week" | "month" | "last-month";

export async function fetchOwnerSummary(
  period: OwnershipPeriod,
): Promise<{
  period: OwnershipPeriod;
  rows: OwnerSummaryRow[];
  /** Leads on the board nobody holds now. */
  unowned: number;
}> {
  return (await api.get("/leads/ownership/summary", { params: { period } })).data;
}

export interface OwnershipRules {
  maxUntouched: number;
  firstActionHours: number;
  followUpDays: number;
}

export async function fetchOwnershipRules(): Promise<OwnershipRules> {
  return (await api.get<OwnershipRules>("/leads/ownership/settings")).data;
}

export async function saveOwnershipRules(rules: OwnershipRules): Promise<OwnershipRules> {
  return (await api.patch<OwnershipRules>("/leads/ownership/settings", rules)).data;
}
