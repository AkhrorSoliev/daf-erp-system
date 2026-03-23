import { create } from "zustand";

export interface Holiday {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface EditHolidayState {
  open: boolean;
  holiday: Holiday | null;
  openDrawer: (holiday: Holiday) => void;
  closeDrawer: () => void;
}

export const useEditHoliday = create<EditHolidayState>((set) => ({
  open: false,
  holiday: null,
  openDrawer: (holiday) => set({ open: true, holiday }),
  closeDrawer: () => set({ open: false, holiday: null }),
}));
