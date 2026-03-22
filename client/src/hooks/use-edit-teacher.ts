import { create } from "zustand";
import type { Teacher } from "@/data/teacher-model";

interface EditTeacherState {
  open: boolean;
  teacher: Teacher | null;
  openDrawer: (teacher: Teacher) => void;
  closeDrawer: () => void;
}

export const useEditTeacher = create<EditTeacherState>((set) => ({
  open: false,
  teacher: null,
  openDrawer: (teacher) => set({ open: true, teacher }),
  closeDrawer: () => set({ open: false, teacher: null }),
}));
