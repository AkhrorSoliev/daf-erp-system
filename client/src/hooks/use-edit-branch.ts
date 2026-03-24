import { create } from "zustand";

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  status: "active" | "inactive";
}

type DrawerMode = "add" | "edit";

interface EditBranchState {
  open: boolean;
  mode: DrawerMode;
  branch: Branch | null;
  openDrawer: (branch: Branch) => void;
  openAddDrawer: () => void;
  closeDrawer: () => void;
}

export const useEditBranch = create<EditBranchState>((set) => ({
  open: false,
  mode: "edit",
  branch: null,
  openDrawer: (branch) => set({ open: true, mode: "edit", branch }),
  openAddDrawer: () => set({ open: true, mode: "add", branch: null }),
  closeDrawer: () => set({ open: false, branch: null }),
}));
