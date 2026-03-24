import { create } from "zustand";

export interface Employee {
  id: string;
  fullName: string;
  role: string;
  phone: string;
  branch: string;
  status: "active" | "inactive";
}

type DrawerMode = "add" | "edit";

interface EditEmployeeState {
  open: boolean;
  mode: DrawerMode;
  employee: Employee | null;
  openDrawer: (employee: Employee) => void;
  openAddDrawer: () => void;
  closeDrawer: () => void;
}

export const useEditEmployee = create<EditEmployeeState>((set) => ({
  open: false,
  mode: "edit",
  employee: null,
  openDrawer: (employee) => set({ open: true, mode: "edit", employee }),
  openAddDrawer: () => set({ open: true, mode: "add", employee: null }),
  closeDrawer: () => set({ open: false, employee: null }),
}));
