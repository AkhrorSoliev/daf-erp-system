import { create } from "zustand";

export interface TeacherData {
  id: number;
  name: string;
  phone: string | null;
  photo: string | null;
  gender: "MALE" | "FEMALE" | null;
  login: string | null;
  balance: number;
  isActive: boolean;
  companyId: number;
  mainBranch: number | null;
  telegramChatId: string | null;
  createdAt: string;
  updatedAt: string;
  roles: { id: number; name: string }[];
  branches: { id: number; name: string }[];
  company: { id: number; name: string };
  groupCount: number;
}

interface EditTeacherState {
  open: boolean;
  mode: "add" | "edit";
  teacher: TeacherData | null;
  submitting: boolean;
  openDrawer: (teacher: TeacherData) => void;
  openAddDrawer: () => void;
  closeDrawer: () => void;
  setSubmitting: (v: boolean) => void;
}

export const useEditTeacher = create<EditTeacherState>((set) => ({
  open: false,
  mode: "edit",
  teacher: null,
  submitting: false,
  openDrawer: (teacher) => set({ open: true, mode: "edit", teacher }),
  openAddDrawer: () => set({ open: true, mode: "add", teacher: null }),
  closeDrawer: () => set({ open: false, teacher: null, submitting: false }),
  setSubmitting: (v) => set({ submitting: v }),
}));
