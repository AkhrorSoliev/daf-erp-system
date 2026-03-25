import { create } from "zustand";
import type { Branch } from "./use-edit-branch";

const mockBranches: Branch[] = [
  { id: "1", name: "Asosiy filial", address: "Toshkent sh., Chilonzor t., 1-kvartal", phone: "901234567", status: "active" },
  { id: "2", name: "2-filial", address: "Toshkent sh., Yunusobod t., 5-kvartal", phone: "912345678", status: "active" },
  { id: "3", name: "3-filial", address: "Toshkent sh., Mirzo Ulug'bek t., 3-kvartal", phone: "933456789", status: "inactive" },
];

interface BranchSwitcherState {
  branches: Branch[];
  selectedBranch: Branch;
  selectBranch: (branch: Branch) => void;
}

export const useBranchSwitcher = create<BranchSwitcherState>((set) => ({
  branches: mockBranches,
  selectedBranch: mockBranches[0],
  selectBranch: (branch) => set({ selectedBranch: branch }),
}));
