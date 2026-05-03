import { create } from "zustand";
import api from "@/lib/api";

interface BranchItem {
  id: number;
  name: string;
  workingDays?: string[];
  startOfWorkingDay?: string | null;
  endOfWorkingDay?: string | null;
}

interface BranchSwitcherState {
  branches: BranchItem[];
  selectedBranch: BranchItem | null;
  loaded: boolean;
  selectBranch: (branch: BranchItem) => void;
  fetchBranches: () => Promise<void>;
  refetchBranches: () => Promise<void>;
}

async function loadBranches(): Promise<BranchItem[]> {
  const companyId = localStorage.getItem("companyId");
  const params = companyId ? { company_id: companyId } : {};
  const { data } = await api.get<BranchItem[]>("/branches", { params });
  return data;
}

export const useBranchSwitcher = create<BranchSwitcherState>((set, get) => ({
  branches: [],
  selectedBranch: null,
  loaded: false,

  selectBranch: (branch) => {
    localStorage.setItem("branchId", String(branch.id));
    set({ selectedBranch: branch });
  },

  fetchBranches: async () => {
    if (get().loaded) return;
    try {
      const data = await loadBranches();
      // localStorage dan oldingi tanlangan branch ni restore qilish
      const savedBranchId = localStorage.getItem("branchId");
      const savedBranch = savedBranchId
        ? data.find((b) => b.id === Number(savedBranchId))
        : null;
      const selected = savedBranch ?? data[0] ?? null;
      if (selected) {
        localStorage.setItem("branchId", String(selected.id));
      }
      set({
        branches: data,
        selectedBranch: selected,
        loaded: true,
      });
    } catch {
      // silently fail
    }
  },

  refetchBranches: async () => {
    try {
      const data = await loadBranches();
      const current = get().selectedBranch;
      const stillExists = current && data.some((b) => b.id === current.id);
      set({
        branches: data,
        selectedBranch: stillExists ? current : data[0] ?? null,
        loaded: true,
      });
    } catch {
      // silently fail
    }
  },
}));
