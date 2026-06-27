import { create } from "zustand";

/**
 * Holds the leads board's transient UI state — which drawer / dialog is open.
 * Keeping it in a store lets deep components (columns, sections, cards) trigger
 * dialogs directly instead of drilling callbacks through the whole board tree.
 */

export interface RenameTarget {
  kind: "column" | "section";
  id: string;
  currentName: string;
  /** Owning column — only set for sections (used for the store update). */
  columnId?: string;
}

export interface DeleteTarget {
  kind: "column" | "section" | "lead";
  id: string;
  name: string;
  /** Owning column — only set for sections. */
  columnId?: string;
  /** Owning section — only set for leads. */
  sectionId?: string;
}

export interface EditLeadTarget {
  id: string;
  /** Section the lead currently sits in — needed to update the board card. */
  sectionId: string;
  firstName: string;
  lastName: string;
  phone: string;
  sourceId: string;
}

export interface MoveLeadTarget {
  id: string;
  /** Section the lead is currently in. */
  sectionId: string;
}

export interface MoveSectionTarget {
  id: string;
  /** Column the section is currently in — excluded from the move options. */
  columnId: string;
  name: string;
}

interface LeadsUiState {
  addLead: { open: boolean; sectionId?: string };
  createSection: { columnId: string; columnName: string } | null;
  createColumnOpen: boolean;
  renameTarget: RenameTarget | null;
  deleteTarget: DeleteTarget | null;
  detailLeadId: string | null;
  /** Tab the detail drawer should open on (e.g. "izohlar"); applied once. */
  detailLeadTab: string | null;
  editLead: EditLeadTarget | null;
  moveLead: MoveLeadTarget | null;
  moveSection: MoveSectionTarget | null;
  convertLead: { id: string; sectionId: string } | null;

  openAddLead: (sectionId?: string) => void;
  closeAddLead: () => void;
  openCreateSection: (columnId: string, columnName: string) => void;
  closeCreateSection: () => void;
  openCreateColumn: () => void;
  closeCreateColumn: () => void;
  openRename: (target: RenameTarget) => void;
  closeRename: () => void;
  openDelete: (target: DeleteTarget) => void;
  closeDelete: () => void;
  openLeadDetail: (leadId: string, tab?: string) => void;
  closeLeadDetail: () => void;
  /** Clears the one-shot tab once the drawer has applied it. */
  clearDetailLeadTab: () => void;
  openEditLead: (target: EditLeadTarget) => void;
  closeEditLead: () => void;
  openMoveLead: (target: MoveLeadTarget) => void;
  closeMoveLead: () => void;
  openMoveSection: (target: MoveSectionTarget) => void;
  closeMoveSection: () => void;
  openConvertLead: (target: { id: string; sectionId: string }) => void;
  closeConvertLead: () => void;
}

export const useLeadsUi = create<LeadsUiState>((set) => ({
  addLead: { open: false },
  createSection: null,
  createColumnOpen: false,
  renameTarget: null,
  deleteTarget: null,
  detailLeadId: null,
  detailLeadTab: null,
  editLead: null,
  moveLead: null,
  moveSection: null,
  convertLead: null,

  openAddLead: (sectionId) => set({ addLead: { open: true, sectionId } }),
  closeAddLead: () => set({ addLead: { open: false } }),
  openCreateSection: (columnId, columnName) =>
    set({ createSection: { columnId, columnName } }),
  closeCreateSection: () => set({ createSection: null }),
  openCreateColumn: () => set({ createColumnOpen: true }),
  closeCreateColumn: () => set({ createColumnOpen: false }),
  openRename: (target) => set({ renameTarget: target }),
  closeRename: () => set({ renameTarget: null }),
  openDelete: (target) => set({ deleteTarget: target }),
  closeDelete: () => set({ deleteTarget: null }),
  openLeadDetail: (leadId, tab) =>
    set({ detailLeadId: leadId, detailLeadTab: tab ?? null }),
  closeLeadDetail: () => set({ detailLeadId: null, detailLeadTab: null }),
  clearDetailLeadTab: () => set({ detailLeadTab: null }),
  // Opening edit / move closes the detail drawer to avoid stacked sheets.
  openEditLead: (target) =>
    set({ editLead: target, detailLeadId: null, detailLeadTab: null }),
  closeEditLead: () => set({ editLead: null }),
  openMoveLead: (target) =>
    set({ moveLead: target, detailLeadId: null, detailLeadTab: null }),
  closeMoveLead: () => set({ moveLead: null }),
  openMoveSection: (target) => set({ moveSection: target }),
  closeMoveSection: () => set({ moveSection: null }),
  openConvertLead: (target) =>
    set({ convertLead: target, detailLeadId: null, detailLeadTab: null }),
  closeConvertLead: () => set({ convertLead: null }),
}));
