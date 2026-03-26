import { create } from "zustand";

export interface TeacherData {
  id: number;
  name: string;
  phone: string | null;
  photo: string | null;
  gender: "MALE" | "FEMALE" | null;
  login: string | null;
  isActive: boolean;
  companyId: number;
  mainBranch: number | null;
  telegramChatId: string | null;
  createdAt: string;
  updatedAt: string;
  roles: { id: number; name: string }[];
  branches: { id: number; name: string }[];
}

interface EditTeacherState {
  open: boolean;
  mode: "add" | "edit";
  teacher: TeacherData | null;
  openDrawer: (teacher: TeacherData) => void;
  openAddDrawer: () => void;
  closeDrawer: () => void;
}

export const useEditTeacher = create<EditTeacherState>((set) => ({
  open: false,
  mode: "edit",
  teacher: null,
  openDrawer: (teacher) => set({ open: true, mode: "edit", teacher }),
  openAddDrawer: () => set({ open: true, mode: "add", teacher: null }),
  closeDrawer: () => set({ open: false, teacher: null }),
}));
