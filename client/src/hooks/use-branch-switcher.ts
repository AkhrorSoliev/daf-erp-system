import { create } from "zustand";
import api from "@/lib/api";
import {
  ALL_BRANCHES,
  BRANCH_STORAGE_KEY,
  branchScopeChanged,
  resolveStoredBranch,
} from "@/lib/branch-header";

interface BranchItem {
  id: number;
  name: string;
  startOfWorkingDay?: string | null;
  endOfWorkingDay?: string | null;
}

/**
 * `null` = "Barcha filiallar" — every branch the caller may see.
 *
 * Only a CEO gets this option. It is a real selection, not "nothing selected":
 * the switcher previously defaulted to `data[0]`, so a CEO was always looking
 * at exactly one branch (in practice always Fargona, the first row) with no way
 * to see a consolidated total — and no indication that was happening.
 */
export type BranchSelection = BranchItem | null;

interface BranchSwitcherState {
  branches: BranchItem[];
  selectedBranch: BranchSelection;
  /** True once the branch list has been resolved for this session. */
  loaded: boolean;
  /** True when the user may pick "Barcha filiallar" (CEO only). */
  canSelectAll: boolean;
  /**
   * Bumps each time the saved selection changes what requests claim — a real
   * switch, or resolving away from a saved branch that is no longer allowed.
   * `BranchScopedMain` keys the page content on it. Resolving to the branch
   * already saved does NOT bump it; see `branchScopeChanged`.
   */
  scopeVersion: number;
  selectBranch: (branch: BranchSelection) => void;
  fetchBranches: () => Promise<void>;
  refetchBranches: () => Promise<void>;
  /** Seed the store from the signed-in user (non-CEO path). */
  hydrateFor: (branches: BranchItem[], canSelectAll: boolean) => void;
}

/**
 * `GET /branches` is now branch-scoped server-side: it returns the caller's
 * CEILING (every branch they may ever see), not the current selection. So the
 * list is authoritative and the client no longer filters it — a non-CEO used to
 * receive every branch in the company and have the UI hide the extras, which is
 * a display rule, not a boundary.
 */
async function loadBranches(): Promise<BranchItem[]> {
  const { data } = await api.get<BranchItem[]>("/branches");
  return data;
}

function storedValue(selection: BranchSelection): string {
  return selection ? String(selection.id) : ALL_BRANCHES;
}

/**
 * Save the selection; returns true when that changed the scope THIS tab's data
 * on screen was fetched under.
 *
 * Before the switcher resolves, that scope is whatever was saved — the page's
 * first requests read it from `localStorage`. After it resolves, it is this
 * tab's own selection, NOT `localStorage`: another tab may have rewritten the
 * shared key, and this tab's rows still belong to what it selected.
 */
function persist(state: BranchSwitcherState, selection: BranchSelection): boolean {
  const previous = state.loaded
    ? storedValue(state.selectedBranch)
    : localStorage.getItem(BRANCH_STORAGE_KEY);
  const next = storedValue(selection);
  localStorage.setItem(BRANCH_STORAGE_KEY, next);
  return branchScopeChanged(previous, next);
}

function nextScopeVersion(state: BranchSwitcherState, changed: boolean): number {
  return changed ? state.scopeVersion + 1 : state.scopeVersion;
}

/** Restore the previous selection, dropping it when it is no longer legal. */
function restoreSelection(
  branches: BranchItem[],
  canSelectAll: boolean,
): BranchSelection {
  return resolveStoredBranch(
    localStorage.getItem(BRANCH_STORAGE_KEY),
    branches,
    canSelectAll,
  );
}

export const useBranchSwitcher = create<BranchSwitcherState>((set, get) => ({
  branches: [],
  selectedBranch: null,
  loaded: false,
  canSelectAll: false,
  scopeVersion: 0,

  selectBranch: (branch) => {
    const changed = persist(get(), branch);
    set((s) => ({
      selectedBranch: branch,
      scopeVersion: nextScopeVersion(s, changed),
    }));
  },

  hydrateFor: (branches, canSelectAll) => {
    const selected = restoreSelection(branches, canSelectAll);
    const changed = persist(get(), selected);
    set((s) => ({
      branches,
      selectedBranch: selected,
      canSelectAll,
      loaded: true,
      scopeVersion: nextScopeVersion(s, changed),
    }));
  },

  fetchBranches: async () => {
    if (get().loaded) return;
    try {
      const data = await loadBranches();
      const canSelectAll = get().canSelectAll;
      const selected = restoreSelection(data, canSelectAll);
      const changed = persist(get(), selected);
      set((s) => ({
        branches: data,
        selectedBranch: selected,
        loaded: true,
        scopeVersion: nextScopeVersion(s, changed),
      }));
    } catch {
      // silently fail
    }
  },

  refetchBranches: async () => {
    try {
      const data = await loadBranches();
      const { selectedBranch, canSelectAll } = get();
      // "Barcha filiallar" survives a refetch; a named branch only survives if
      // it is still in the list (it may have been archived).
      const stillValid =
        selectedBranch === null
          ? canSelectAll
          : data.some((b) => b.id === selectedBranch.id);
      const next = stillValid
        ? selectedBranch
        : restoreSelection(data, canSelectAll);
      const changed = persist(get(), next);
      set((s) => ({
        branches: data,
        selectedBranch: next,
        loaded: true,
        scopeVersion: nextScopeVersion(s, changed),
      }));
    } catch {
      // silently fail
    }
  },
}));
