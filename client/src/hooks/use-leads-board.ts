import { create } from "zustand";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { registerBranchScopedStore } from "@/lib/branch-scoped-stores";
import { msg } from "@/i18n/msg";
import type { LeadOwner } from "@/components/leads/ownership/ownership-format";

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
  /** Set once the lead has been called — drives the phone icon on the card. */
  calledAt: string | null;
  /** Number of comments left on the lead — drives the comment icon. */
  commentCount: number;
  /** The lead's owner (ADR-0093); null while it sits in the common pool. */
  owner: LeadOwner | null;
  /** When the lead returns to the pool unless its owner acts (server-computed). */
  ownerDueAt: string | null;
  /** A live student with the same phone — the lead is tied to another profile. */
  linkedStudent?: { id: number; firstName: string; lastName: string } | null;
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
  /**
   * The board is per branch: a section names a level, weekday pattern, hour and
   * teacher ("A1 SPSH 15:00 Eldor"), which is a forming group and belongs to
   * one branch. Only a CEO viewing "Barcha filiallar" sees more than one branch
   * at a time, and that is the only place this is rendered.
   */
  branchId: number;
  branch: { id: number; name: string } | null;
  sections: LeadBoardSection[];
}

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

// msg() texts: a translated page draws them with t(). NEW reads «Yangi lid»
// because the dictionary's «Yangi» means creating.
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: msg("Yangi lid"),
  CONTACTED: msg("Aloqaga chiqilgan"),
  TRIAL: msg("Sinov darsida"),
  CONVERTED: msg("O'quvchiga aylangan"),
  LOST: msg("Yo'qotilgan"),
  ARCHIVED: msg("Arxivlangan"),
};

// Mirror of the backend LEAD_LINKED_REASON sentinel (Lead.statusChangeReason):
// a CONVERTED lead carrying it was LINKED to an existing student, not converted
// into a fresh account.
export const LEAD_LINKED_REASON = "LINKED_TO_EXISTING";

/**
 * Display label for a CONVERTED lead, distinguishing "linked to an existing
 * student" from a fresh conversion. Falls back to the plain converted label for
 * any other status.
 */
export function leadConvertedLabel(
  statusEnum: LeadStatus,
  statusChangeReason: string | null | undefined,
  t: (source: string) => string = (source) => source,
): string {
  // The other statuses come back untranslated (their callers draw them).
  if (statusEnum !== "CONVERTED") return LEAD_STATUS_LABELS[statusEnum];
  return statusChangeReason === LEAD_LINKED_REASON
    ? t("Mavjud o'quvchiga biriktirilgan")
    : t("O'quvchiga aylangan");
}

// The system column every branch is born with (branches.service.ts); the server
// refuses to rename it, so its stored name is this text.
const NEW_LEADS_COLUMN = msg("Yangi Lidlar");

/**
 * A board column's name. The system «Yangi Lidlar» column is drawn through `t`;
 * any other name is the staff's data and comes back as stored.
 */
export function leadColumnName(
  column: { name: string; systemKey?: string | null },
  t: (source: string) => string = (source) => source,
): string {
  return column.systemKey === "NEW" && column.name === NEW_LEADS_COLUMN
    ? t(NEW_LEADS_COLUMN)
    : column.name;
}

// The store's own toast fallbacks are msg() texts; a page that draws the board
// hands its `t` in with setLeadsBoardTranslator (identity until then).
let translate: (source: string) => string = (source) => source;
export function setLeadsBoardTranslator(fn: (source: string) => string): void {
  translate = fn;
}
const fail = (error: unknown, fallback: string) =>
  toast.error(getErrorMessage(error, translate(fallback)));

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
  /** Sections whose last fetch failed — drawn as an error, not as "no leads". */
  failedSections: Set<string>;
  /** Bumps on every lead create / edit / move so the filtered list refetches. */
  revision: number;
  /** `quiet` refetches without the board skeleton (open sections stay open). */
  fetchBoard: (quiet?: boolean) => Promise<void>;
  /** `force` re-reads a section that is already loaded (the owner's deadline moved). */
  fetchSectionLeads: (sectionId: string, force?: boolean) => Promise<void>;
  /**
   * Re-reads the board and every loaded section, and bumps `revision` — for a
   * change made elsewhere that shows on the cards (e.g. a lead source renamed).
   */
  refreshAll: () => Promise<void>;
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
  /** Moves a section into another column (drag-and-drop or the move dialog). */
  moveSectionToColumn: (
    sectionId: string,
    fromColumnId: string,
    toColumnId: string,
  ) => Promise<void>;
  /** Reorders a section within its column to the dropped-on section's slot. */
  reorderSection: (
    columnId: string,
    activeSectionId: string,
    overSectionId: string,
  ) => Promise<void>;
  applyLeadUpdate: (sectionId: string, lead: LeadCard) => void;
  /** Adjusts a card's comment count in place (e.g. after a comment is added). */
  bumpLeadCommentCount: (
    sectionId: string,
    leadId: string,
    delta: number,
  ) => void;
  moveLead: (
    leadId: string,
    fromSectionId: string,
    toSectionId: string,
  ) => Promise<void>;
  applyLeadRemove: (sectionId: string, leadId: string) => void;

  // --- Sortable drag session ---------------------------------------------
  // During a @dnd-kit/sortable drag the local state is reflowed on every
  // onDragOver (no API) so neighbours slide to make room; the API call fires
  // once on drop. A single snapshot taken at drag start backs the rollback.
  dragSnapshot: {
    board: LeadBoardColumn[];
    leadsBySection: Record<string, LeadCard[]>;
  } | null;
  captureDragSnapshot: () => void;
  clearDragSnapshot: () => void;
  rollbackDrag: () => void;
  /** Replaces a section's loaded lead array (same-container arrayMove on drop). */
  setLeadsForSection: (sectionId: string, leads: LeadCard[]) => void;
  /** Replaces a column's section array (same-container arrayMove on drop). */
  setSectionsForColumn: (columnId: string, sections: LeadBoardSection[]) => void;
  /** Moves a card between sections in LOCAL state + keeps leadCount badges in sync. */
  moveLeadLocal: (args: {
    leadId: string;
    fromSectionId: string;
    toSectionId: string;
    toIndex: number;
  }) => void;
  /** Moves a section between columns in LOCAL state. */
  moveSectionLocal: (args: {
    sectionId: string;
    fromColumnId: string;
    toColumnId: string;
    toIndex: number;
  }) => void;
  persistLeadReorder: (sectionId: string, leadIds: string[]) => Promise<void>;
  persistLeadMove: (args: {
    leadId: string;
    toSectionId: string;
    toLeadIds: string[];
  }) => Promise<void>;
  persistSectionReorder: (
    columnId: string,
    sectionIds: string[],
  ) => Promise<void>;
  persistSectionMove: (args: {
    sectionId: string;
    toColumnId: string;
    toSectionIds: string[];
  }) => Promise<void>;
}

export const useLeadsBoard = create<LeadsBoardState>((set, get) => ({
  board: [],
  leadsBySection: {},
  loadingBoard: false,
  loadedSections: new Set(),
  loadingSections: new Set(),
  failedSections: new Set(),
  revision: 0,
  dragSnapshot: null,

  fetchBoard: async (quiet = false) => {
    if (!quiet) set({ loadingBoard: true });
    try {
      const { data } = await api.get<LeadBoardColumn[]>("/leads/board");
      set({ board: data, loadingBoard: false });
    } catch (error) {
      set({ loadingBoard: false });
      fail(error, msg("Lidlar boardini yuklashda xatolik"));
    }
  },

  fetchSectionLeads: async (sectionId, force = false) => {
    const { loadedSections, loadingSections } = get();
    if ((!force && loadedSections.has(sectionId)) || loadingSections.has(sectionId)) return;

    set({ loadingSections: new Set(loadingSections).add(sectionId) });
    try {
      const { data } = await api.get<LeadCard[]>(
        `/leads/sections/${sectionId}/leads`,
      );
      set((s) => {
        const loading = new Set(s.loadingSections);
        loading.delete(sectionId);
        const failed = new Set(s.failedSections);
        failed.delete(sectionId);
        return {
          leadsBySection: { ...s.leadsBySection, [sectionId]: data },
          loadedSections: new Set(s.loadedSections).add(sectionId),
          loadingSections: loading,
          failedSections: failed,
        };
      });
    } catch (error) {
      set((s) => {
        const loading = new Set(s.loadingSections);
        loading.delete(sectionId);
        return {
          loadingSections: loading,
          failedSections: new Set(s.failedSections).add(sectionId),
        };
      });
      fail(error, msg("Lidlarni yuklashda xatolik"));
    }
  },

  refreshAll: async () => {
    set((s) => ({ revision: s.revision + 1 }));
    await get().fetchBoard(true);
    // Only sections still on the board: a removed one would answer 404.
    const onBoard = new Set(
      get().board.flatMap((c) => c.sections.map((sec) => sec.id)),
    );
    await Promise.all(
      [...get().loadedSections]
        .filter((id) => onBoard.has(id))
        .map((id) => get().fetchSectionLeads(id, true)),
    );
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
      // Deleting a section archives its leads: the stats, owners strip and
      // filtered list key on `revision`.
      revision: s.revision + 1,
    }));
  },

  moveColumn: async (id, direction) => {
    const { board } = get();
    // Column order is per branch on the server; "Barcha filiallar" mixes
    // branches, so there is no single order to write.
    if (new Set(board.map((c) => c.branchId)).size > 1) return;
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
      fail(error, msg("Ustun tartibini o'zgartirishda xatolik"));
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
      fail(error, msg("Bo'lim tartibini o'zgartirishda xatolik"));
    }
  },

  moveSectionToColumn: async (sectionId, fromColumnId, toColumnId) => {
    if (fromColumnId === toColumnId) return;
    const { board } = get();
    const fromColumn = board.find((c) => c.id === fromColumnId);
    const toColumn = board.find((c) => c.id === toColumnId);
    if (!fromColumn || !toColumn) return;
    const section = fromColumn.sections.find((s) => s.id === sectionId);
    if (!section) return;

    const prevBoard = board;
    // Optimistic: drop from the source column, append to the target column.
    set({
      board: board.map((c) => {
        if (c.id === fromColumnId)
          return {
            ...c,
            sections: c.sections.filter((s) => s.id !== sectionId),
          };
        if (c.id === toColumnId)
          return { ...c, sections: [...c.sections, section] };
        return c;
      }),
    });
    try {
      await api.patch(`/lead-sections/${sectionId}/move`, {
        targetColumnId: toColumnId,
      });
    } catch (error) {
      set({ board: prevBoard });
      fail(error, msg("Bo'limni ko'chirishda xatolik"));
    }
  },

  reorderSection: async (columnId, activeSectionId, overSectionId) => {
    const { board } = get();
    const column = board.find((c) => c.id === columnId);
    if (!column) return;
    const oldIndex = column.sections.findIndex((s) => s.id === activeSectionId);
    const newIndex = column.sections.findIndex((s) => s.id === overSectionId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reordered = [...column.sections];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

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
      fail(error, msg("Bo'lim tartibini o'zgartirishda xatolik"));
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

  bumpLeadCommentCount: (sectionId, leadId, delta) => {
    set((s) => {
      const existing = s.leadsBySection[sectionId];
      if (!existing) return {};
      return {
        leadsBySection: {
          ...s.leadsBySection,
          [sectionId]: existing.map((l) =>
            l.id === leadId
              ? { ...l, commentCount: Math.max(0, l.commentCount + delta) }
              : l,
          ),
        },
      };
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
      // A collapsed source never held the card, so a loaded target gets it now.
      set((s) => {
        const target = s.leadsBySection[toSectionId];
        if (!target) return {};
        return {
          leadsBySection: {
            ...s.leadsBySection,
            [toSectionId]: target.some((l) => l.id === leadId)
              ? target.map((l) => (l.id === leadId ? data : l))
              : [...target, data],
          },
        };
      });
    } catch (error) {
      set({ board: prevBoard, leadsBySection: prevLeads });
      fail(error, msg("Lidni ko'chirishda xatolik"));
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

  // --- Sortable drag session ---------------------------------------------

  captureDragSnapshot: () => {
    set((s) => ({
      dragSnapshot: {
        board: s.board.map((c) => ({
          ...c,
          sections: c.sections.map((sec) => ({ ...sec })),
        })),
        leadsBySection: Object.fromEntries(
          Object.entries(s.leadsBySection).map(([k, v]) => [k, [...v]]),
        ),
      },
    }));
  },

  clearDragSnapshot: () => set({ dragSnapshot: null }),

  rollbackDrag: () =>
    set((s) =>
      s.dragSnapshot
        ? {
            board: s.dragSnapshot.board,
            leadsBySection: s.dragSnapshot.leadsBySection,
            dragSnapshot: null,
          }
        : {},
    ),

  setLeadsForSection: (sectionId, leads) =>
    set((s) => ({
      leadsBySection: { ...s.leadsBySection, [sectionId]: leads },
    })),

  setSectionsForColumn: (columnId, sections) =>
    set((s) => ({
      board: s.board.map((c) => (c.id === columnId ? { ...c, sections } : c)),
    })),

  moveLeadLocal: ({ leadId, fromSectionId, toSectionId, toIndex }) => {
    if (fromSectionId === toSectionId) return;
    set((s) => {
      const leadsBySection = { ...s.leadsBySection };
      const fromLeads = leadsBySection[fromSectionId];
      const moved = fromLeads?.find((l) => l.id === leadId);
      if (fromLeads) {
        leadsBySection[fromSectionId] = fromLeads.filter(
          (l) => l.id !== leadId,
        );
      }
      // Insert into the target only when it is loaded (expanded). A collapsed
      // target just gets its badge bumped; the card lands on drop (append).
      if (moved && leadsBySection[toSectionId]) {
        const target = [...leadsBySection[toSectionId]];
        const i = Math.max(0, Math.min(toIndex, target.length));
        target.splice(i, 0, moved);
        leadsBySection[toSectionId] = target;
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
      return { board, leadsBySection };
    });
  },

  moveSectionLocal: ({ sectionId, fromColumnId, toColumnId, toIndex }) => {
    if (fromColumnId === toColumnId) return;
    set((s) => {
      let moved: LeadBoardSection | undefined;
      const stripped = s.board.map((c) => {
        if (c.id === fromColumnId) {
          moved = c.sections.find((sec) => sec.id === sectionId);
          return {
            ...c,
            sections: c.sections.filter((sec) => sec.id !== sectionId),
          };
        }
        return c;
      });
      if (!moved) return {};
      const board = stripped.map((c) => {
        if (c.id === toColumnId) {
          const target = [...c.sections];
          const i = Math.max(0, Math.min(toIndex, target.length));
          target.splice(i, 0, moved as LeadBoardSection);
          return { ...c, sections: target };
        }
        return c;
      });
      return { board };
    });
  },

  persistLeadReorder: async (sectionId, leadIds) => {
    try {
      await api.patch("/leads/reorder", { sectionId, leadIds });
      get().clearDragSnapshot();
    } catch (error) {
      get().rollbackDrag();
      fail(error, msg("Lid tartibini o'zgartirishda xatolik"));
    }
  },

  persistLeadMove: async ({ leadId, toSectionId, toLeadIds }) => {
    let data: LeadCard;
    try {
      ({ data } = await api.patch<LeadCard>(`/leads/${leadId}/move`, {
        sectionId: toSectionId,
      }));
    } catch (error) {
      get().rollbackDrag();
      fail(error, msg("Lidni ko'chirishda xatolik"));
      return;
    }
    // Replace the optimistic card with the server copy (status may sync).
    set((s) => {
      const target = s.leadsBySection[toSectionId];
      return {
        revision: s.revision + 1,
        ...(target && {
          leadsBySection: {
            ...s.leadsBySection,
            [toSectionId]: target.map((l) => (l.id === leadId ? data : l)),
          },
        }),
      };
    });
    // Persist the dropped position when the target list is loaded; a collapsed
    // target keeps the server append (order is correct on next expand).
    if (toLeadIds.length > 0) {
      try {
        await api.patch("/leads/reorder", {
          sectionId: toSectionId,
          leadIds: toLeadIds,
        });
      } catch (error) {
        // The move is already saved, so a rollback would put the card back in a
        // section it has left. Re-read the target for the server's order.
        get().clearDragSnapshot();
        void get().fetchSectionLeads(toSectionId, true);
        fail(error, msg("Lid tartibini o'zgartirishda xatolik"));
        return;
      }
    }
    get().clearDragSnapshot();
  },

  persistSectionReorder: async (columnId, sectionIds) => {
    try {
      await api.patch("/lead-sections/reorder", { columnId, sectionIds });
      get().clearDragSnapshot();
    } catch (error) {
      get().rollbackDrag();
      fail(error, msg("Bo'lim tartibini o'zgartirishda xatolik"));
    }
  },

  persistSectionMove: async ({ sectionId, toColumnId, toSectionIds }) => {
    try {
      await api.patch(`/lead-sections/${sectionId}/move`, {
        targetColumnId: toColumnId,
      });
    } catch (error) {
      get().rollbackDrag();
      fail(error, msg("Bo'limni ko'chirishda xatolik"));
      return;
    }
    if (toSectionIds.length > 0) {
      try {
        await api.patch("/lead-sections/reorder", {
          columnId: toColumnId,
          sectionIds: toSectionIds,
        });
      } catch (error) {
        // The move is already saved; re-read the board instead of rolling back.
        get().clearDragSnapshot();
        void get().fetchBoard(true);
        fail(error, msg("Bo'lim tartibini o'zgartirishda xatolik"));
        return;
      }
    }
    get().clearDragSnapshot();
  },
}));

// The board is per branch now — its columns, its sections and every lead in
// them. Without this the store kept Fargona's board after a switch to Namangan,
// and `fetchSectionLeads`'s `loadedSections` guard meant even a refetch skipped
// every section already open. See `lib/branch-scoped-stores.ts`.
registerBranchScopedStore(useLeadsBoard);
