import { create } from "zustand";
import type { Student } from "@/data/student-model";

interface EditStudentState {
  open: boolean;
  student: Student | null;
  openDrawer: (student: Student) => void;
  closeDrawer: () => void;
}

export const useEditStudent = create<EditStudentState>((set) => ({
  open: false,
  student: null,
  openDrawer: (student) => set({ open: true, student }),
  closeDrawer: () => set({ open: false, student: null }),
}));
