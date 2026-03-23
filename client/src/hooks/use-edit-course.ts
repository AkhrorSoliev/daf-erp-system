import { create } from "zustand";
import type { Course } from "@/data/courses-model";

type DrawerMode = "add" | "edit";

interface EditCourseState {
  open: boolean;
  mode: DrawerMode;
  course: Course | null;
  openDrawer: (course: Course) => void;
  openAddDrawer: () => void;
  closeDrawer: () => void;
}

export const useEditCourse = create<EditCourseState>((set) => ({
  open: false,
  mode: "edit",
  course: null,
  openDrawer: (course) => set({ open: true, mode: "edit", course }),
  openAddDrawer: () => set({ open: true, mode: "add", course: null }),
  closeDrawer: () => set({ open: false, course: null }),
}));
