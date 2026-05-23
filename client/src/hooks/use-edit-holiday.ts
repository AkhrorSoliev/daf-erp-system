import { create } from "zustand";

export interface Holiday {
  id: string;
  name: string;
  date: string;
  endDate: string;
}

type DrawerMode = "add" | "edit";

interface EditHolidayState {
  open: boolean;
  mode: DrawerMode;
  holiday: Holiday | null;
  submitting: boolean;
  openAddDrawer: () => void;
  openDrawer: (holiday: Holiday) => void;
  closeDrawer: () => void;
  setSubmitting: (value: boolean) => void;
}

export const useEditHoliday = create<EditHolidayState>((set) => ({
  open: false,
  mode: "edit",
  holiday: null,
  submitting: false,
  openAddDrawer: () => set({ open: true, mode: "add", holiday: null }),
  openDrawer: (holiday) => set({ open: true, mode: "edit", holiday }),
  closeDrawer: () =>
    set({ open: false, holiday: null, mode: "edit", submitting: false }),
  setSubmitting: (value) => set({ submitting: value }),
}));
