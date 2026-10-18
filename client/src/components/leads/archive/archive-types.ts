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
