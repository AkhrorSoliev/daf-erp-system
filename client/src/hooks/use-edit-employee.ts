import { create } from "zustand";

export interface EmployeeUser {
  id: number;
  name: string;
  phone: string | null;
  photo: string | null;
  gender: string | null;
  login: string | null;
  telegramChatId: string | null;
  mainBranch: number | null;
  balance: number;
  status: string;
  roles: { id: number; name: string }[];
  branches: { id: number; name: string }[];
  createdAt: string;
}

type DrawerMode = "add" | "edit";

interface EditEmployeeState {
  open: boolean;
  mode: DrawerMode;
  employee: EmployeeUser | null;
  submitting: boolean;
  openDrawer: (employee: EmployeeUser) => void;
  openAddDrawer: () => void;
  closeDrawer: () => void;
  setSubmitting: (value: boolean) => void;
}

export const useEditEmployee = create<EditEmployeeState>((set) => ({
  open: false,
  mode: "edit",
  employee: null,
  submitting: false,
  openDrawer: (employee) => set({ open: true, mode: "edit", employee }),
  openAddDrawer: () => set({ open: true, mode: "add", employee: null }),
  closeDrawer: () => set({ open: false, employee: null, submitting: false }),
  setSubmitting: (value) => set({ submitting: value }),
}));
