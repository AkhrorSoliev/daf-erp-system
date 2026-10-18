import type { LeadStatus } from "@/hooks/use-leads-board";
export type { ArchiveSummary, Paged } from "./archive-cache";
export type { RestoreColumn as BoardColumn } from "./restore-lead-model";

export interface DeletedBy {
  id: number;
  firstName: string;
  lastName: string;
}

export interface ArchivedLead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** Why the lead was lost — set when it was deleted directly (delete = LOST). */
  lostReason: string | null;
  deletedAt: string | null;
  deletedBy: DeletedBy | null;
  section: {
    id: string;
    name: string;
    column: { id: string; name: string } | null;
  } | null;
  /** What restoring will change (the server's words). */
  notes: string[];
}

export interface ArchivedSection {
  id: string;
  name: string;
  deletedAt: string | null;
  deletedBy: DeletedBy | null;
  column: { id: string; name: string } | null;
  leadCount: number;
}

export interface ArchivedLeadDetail {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  extraPhone: string | null;
  statusEnum: LeadStatus;
  convertedStudentId: number | null;
  statusChangeReason: string | null;
  lostReason: string | null;
  createdAt: string;
  calledAt: string | null;
  calledBy: DeletedBy | null;
  owner: DeletedBy | null;
  ownedAt: string | null;
  source: { id: string; name: string } | null;
  section: ArchivedLead["section"];
  deletedAt: string | null;
  deletedBy: DeletedBy | null;
  /** What restoring will change (the server's words). */
  notes: string[];
  ownershipLog: OwnershipLogEntry[];
}

export interface OwnershipLogEntry {
  id: string;
  kind: "CLAIM" | "ASSIGN" | "RELEASE" | "EXPIRE";
  from: string | null;
  to: string | null;
  /** Null = the system. */
  actor: string | null;
  reason: string | null;
  createdAt: string;
}
