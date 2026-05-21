import { create } from "zustand";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "TRIAL"
  | "CONVERTED"
  | "LOST"
  | "ARCHIVED";

export interface LeadSourceOption {
  id: string;
  name: string;
}

/** Compact lead shape rendered as a card on the board. */
export interface LeadCard {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  statusEnum: LeadStatus;
  order: number;
  createdAt: string;
  source: LeadSourceOption | null;
}

export interface LeadBoardSection {
  id: string;
  name: string;
  order: number;
  leadCount: number;
}

export interface LeadBoardColumn {
  id: string;
  name: string;
  order: number;
  isSystem: boolean;
  systemKey: string | null;
  sections: LeadBoardSection[];
}

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "Yangi",
  CONTACTED: "Aloqaga chiqilgan",
  TRIAL: "Sinov darsida",
  CONVERTED: "O'quvchiga aylangan",
  LOST: "Yo'qotilgan",
  ARCHIVED: "Arxivlangan",
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface LeadsBoardState {
  board: LeadBoardColumn[];
  leadsBySection: Record<string, LeadCard[]>;
  loadingBoard: boolean;
  /** Sections whose leads have already been fetched. */
  loadedSections: Set<string>;
  /** Sections whose leads are being fetched right now. */
  loadingSections: Set<string>;
  /** Bumps on every lead create / edit / move so the filtered list refetches. */
  revision: number;
  fetchBoard: () => Promise<void>;
  fetchSectionLeads: (sectionId: string) => Promise<void>;
  addSection: (section: LeadBoardSection & { columnId: string }) => void;
  addLead: (sectionId: string, lead: LeadCard) => void;
  addColumn: (column: LeadBoardColumn) => void;
  applyColumnRename: (id: string, name: string) => void;
  applyColumnRemove: (id: string) => void;
  applySectionRename: (
    columnId: string,
    sectionId: string,
    name: string,
  ) => void;
  applySectionRemove: (columnId: string, sectionId: string) => void;
  moveColumn: (id: string, direction: "left" | "right") => Promise<void>;
  moveSection: (
    columnId: string,
    sectionId: string,
    direction: "up" | "down",
  ) => Promise<void>;
  applyLeadUpdate: (sectionId: string, lead: LeadCard) => void;
  moveLead: (
    leadId: string,
    fromSectionId: string,
    toSectionId: string,
  ) => Promise<void>;
  applyLeadRemove: (sectionId: string, leadId: string) => void;
}

export const useLeadsBoard = create<LeadsBoardState>((set, get) => ({
  board: [],
  leadsBySection: {},
  loadingBoard: false,
  loadedSections: new Set(),
  loadingSections: new Set(),
  revision: 0,

  fetchBoard: async () => {
    set({ loadingBoard: true });
    try {
      const { data } = await api.get<LeadBoardColumn[]>("/leads/board");
      set({ board: data, loadingBoard: false });
    } catch (error) {
      set({ loadingBoard: false });
      toast.error(getErrorMessage(error, "Lidlar boardini yuklashda xatolik"));
    }
  },

  fetchSectionLeads: async (sectionId) => {
    const { loadedSections, loadingSections } = get();
    if (loadedSections.has(sectionId) || loadingSections.has(sectionId)) return;

    set({ loadingSections: new Set(loadingSections).add(sectionId) });
    try {
      const { data } = await api.get<LeadCard[]>(
        `/leads/sections/${sectionId}/leads`,
      );
      set((s) => {
        const loading = new Set(s.loadingSections);
        loading.delete(sectionId);
        return {
          leadsBySection: { ...s.leadsBySection, [sectionId]: data },
          loadedSections: new Set(s.loadedSections).add(sectionId),
          loadingSections: loading,
        };
      });
    } catch (error) {
      set((s) => {
        const loading = new Set(s.loadingSections);
        loading.delete(sectionId);
        return { loadingSections: loading };
      });
      toast.error(getErrorMessage(error, "Lidlarni yuklashda xatolik"));
    }
  },

  addSection: (section) => {
    set((s) => ({
      board: s.board.map((col) =>
        col.id === section.columnId
          ? {
              ...col,
              sections: [
                ...col.sections,
                {
                  id: section.id,
                  name: section.name,
                  order: section.order,
                  leadCount: section.leadCount,
                },
              ],
            }
          : col,
      ),
    }));
  },

  addLead: (sectionId, lead) => {
    set((s) => {
      const board = s.board.map((col) => ({
        ...col,
        sections: col.sections.map((sec) =>
          sec.id === sectionId
            ? { ...sec, leadCount: sec.leadCount + 1 }
            : sec,
        ),
      }));
      // Only append to the cache if this section's leads are already loaded;
      // otherwise the new lead is picked up the first time it is expanded.
      const existing = s.leadsBySection[sectionId];
      const leadsBySection = existing
        ? { ...s.leadsBySection, [sectionId]: [...existing, lead] }
        : s.leadsBySection;
      return { board, leadsBySection, revision: s.revision + 1 };
    });
  },

  addColumn: (column) => {
    set((s) => ({ board: [...s.board, column] }));
  },

  applyColumnRename: (id, name) => {
    set((s) => ({
      board: s.board.map((col) => (col.id === id ? { ...col, name } : col)),
    }));
  },

  applyColumnRemove: (id) => {
    set((s) => ({ board: s.board.filter((col) => col.id !== id) }));
  },

  applySectionRename: (columnId, sectionId, name) => {
    set((s) => ({
      board: s.board.map((col) =>
        col.id === columnId
          ? {
              ...col,
              sections: col.sections.map((sec) =>
                sec.id === sectionId ? { ...sec, name } : sec,
              ),
            }
          : col,
      ),
    }));
  },

  applySectionRemove: (columnId, sectionId) => {
    set((s) => ({
      board: s.board.map((col) =>
        col.id === columnId
          ? {
              ...col,
              sections: col.sections.filter((sec) => sec.id !== sectionId),
            }
          : col,
      ),
    }));
  },

  moveColumn: async (id, direction) => {
    const { board } = get();
    const custom = board.filter((c) => !c.isSystem);
    const idx = custom.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const target = direction === "left" ? idx - 1 : idx + 1;
    if (target < 0 || target >= custom.length) return;

    const reordered = [...custom];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    const system = board.filter((c) => c.isSystem);

    const prevBoard = board;
    set({ board: [...system, ...reordered] });
    try {
      await api.patch("/lead-columns/reorder", {
        columnIds: reordered.map((c) => c.id),
      });
    } catch (error) {
      set({ board: prevBoard });
      toast.error(
        getErrorMessage(error, "Ustun tartibini o'zgartirishda xatolik"),
      );
    }
  },

  moveSection: async (columnId, sectionId, direction) => {
    const { board } = get();
    const column = board.find((c) => c.id === columnId);
    if (!column) return;
    const idx = column.sections.findIndex((s) => s.id === sectionId);
    if (idx === -1) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= column.sections.length) return;

    const reordered = [...column.sections];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];

    const prevBoard = board;
    set({
      board: board.map((c) =>
        c.id === columnId ? { ...c, sections: reordered } : c,
      ),
    });
    try {
      await api.patch("/lead-sections/reorder", {
        columnId,
        sectionIds: reordered.map((s) => s.id),
      });
    } catch (error) {
      set({ board: prevBoard });
      toast.error(
        getErrorMessage(error, "Bo'lim tartibini o'zgartirishda xatolik"),
      );
    }
  },

  applyLeadUpdate: (sectionId, lead) => {
    set((s) => {
      const existing = s.leadsBySection[sectionId];
      const leadsBySection = existing
        ? {
            ...s.leadsBySection,
            [sectionId]: existing.map((l) => (l.id === lead.id ? lead : l)),
          }
        : s.leadsBySection;
      return { leadsBySection, revision: s.revision + 1 };
    });
  },

  moveLead: async (leadId, fromSectionId, toSectionId) => {
    if (fromSectionId === toSectionId) return;
    const prevBoard = get().board;
    const prevLeads = get().leadsBySection;
    const moved = (prevLeads[fromSectionId] ?? []).find(
      (l) => l.id === leadId,
    );

    // Optimistic: drop from the source, append to the target (if loaded),
    // and shift the per-section counts.
    set((s) => {
      const leadsBySection = { ...s.leadsBySection };
      if (leadsBySection[fromSectionId]) {
        leadsBySection[fromSectionId] = leadsBySection[fromSectionId].filter(
          (l) => l.id !== leadId,
        );
      }
      if (moved && leadsBySection[toSectionId]) {
        leadsBySection[toSectionId] = [
          ...leadsBySection[toSectionId],
          moved,
        ];
      }
      const board = s.board.map((col) => ({
        ...col,
        sections: col.sections.map((sec) => {
          if (sec.id === fromSectionId)
            return { ...sec, leadCount: Math.max(0, sec.leadCount - 1) };
          if (sec.id === toSectionId)
            return { ...sec, leadCount: sec.leadCount + 1 };
          return sec;
        }),
      }));
      return { board, leadsBySection, revision: s.revision + 1 };
    });

    try {
      const { data } = await api.patch<LeadCard>(
        `/leads/${leadId}/move`,
        { sectionId: toSectionId },
      );
      // Replace the optimistic card with the server copy (status may sync).
      set((s) => {
        if (!s.leadsBySection[toSectionId]) return {};
        return {
          leadsBySection: {
            ...s.leadsBySection,
            [toSectionId]: s.leadsBySection[toSectionId].map((l) =>
              l.id === leadId ? data : l,
            ),
          },
        };
      });
    } catch (error) {
      set({ board: prevBoard, leadsBySection: prevLeads });
      toast.error(getErrorMessage(error, "Lidni ko'chirishda xatolik"));
    }
  },

  applyLeadRemove: (sectionId, leadId) => {
    set((s) => {
      const leadsBySection = { ...s.leadsBySection };
      if (leadsBySection[sectionId]) {
        leadsBySection[sectionId] = leadsBySection[sectionId].filter(
          (l) => l.id !== leadId,
        );
      }
      const board = s.board.map((col) => ({
        ...col,
        sections: col.sections.map((sec) =>
          sec.id === sectionId
            ? { ...sec, leadCount: Math.max(0, sec.leadCount - 1) }
            : sec,
        ),
      }));
      return { board, leadsBySection, revision: s.revision + 1 };
    });
  },
}));
