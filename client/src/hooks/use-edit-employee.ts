import { create } from "zustand";

export interface Employee {
  id: string;
  fullName: string;
  role: string;
  phone: string;
  branch: string;
  status: "active" | "inactive";
}

interface EditEmployeeState {
  open: boolean;
  employee: Employee | null;
  openDrawer: (employee: Employee) => void;
  closeDrawer: () => void;
}

export const useEditEmployee = create<EditEmployeeState>((set) => ({
  open: false,
  employee: null,
  openDrawer: (employee) => set({ open: true, employee }),
  closeDrawer: () => set({ open: false, employee: null }),
}));
