import { create } from "zustand";
import type { Student } from "@/data/student-model";

interface EditStudentState {
  open: boolean;
  student: Student | null;
  submitting: boolean;
  openDrawer: (student: Student) => void;
  closeDrawer: () => void;
  setSubmitting: (value: boolean) => void;
}

export const useEditStudent = create<EditStudentState>((set) => ({
  open: false,
  student: null,
  submitting: false,
  openDrawer: (student) => set({ open: true, student }),
  closeDrawer: () => set({ open: false, student: null, submitting: false }),
  setSubmitting: (value) => set({ submitting: value }),
}));
