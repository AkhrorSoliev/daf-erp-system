import { create } from "zustand";

export interface Course {
  id: string;
  name: string;
  level: string | null;
  description: string | null;
  lessonDuration: number | null;
  lessonMinutes: number | null;
  courseDuration: number | null;
  price: number;
  isActive: boolean;
  branchId: number | null;
}

type DrawerMode = "add" | "edit";

interface EditCourseState {
  open: boolean;
  mode: DrawerMode;
  course: Course | null;
  submitting: boolean;
  openDrawer: (course: Course) => void;
  openAddDrawer: () => void;
  closeDrawer: () => void;
  setSubmitting: (v: boolean) => void;
}

export const useEditCourse = create<EditCourseState>((set) => ({
  open: false,
  mode: "edit",
  course: null,
  submitting: false,
  openDrawer: (course) => set({ open: true, mode: "edit", course }),
  openAddDrawer: () => set({ open: true, mode: "add", course: null }),
  closeDrawer: () => set({ open: false, course: null }),
  setSubmitting: (v) => set({ submitting: v }),
}));
