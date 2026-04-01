import { create } from "zustand";

export interface GroupData {
  id: string;
  name: string;
  groupNumber: number | null;
  days: string | null;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  status: number;
  statusEnum: string;
  comment: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  branchId: number;
  companyId: number | null;
  createdAt: string;
  updatedAt: string;
  course: {
    id: string;
    name: string;
    level: string | null;
    description: string | null;
    lessonDuration: number | null;
    lessonMinutes: number | null;
    courseDuration: number | null;
    price: number;
    isActive: boolean;
  };
  room: { id: string; name: string; capacity: number | null } | null;
  branch: { id: number; name: string };
  teachers: { id: number; firstName: string; lastName: string; phone: string | null; photo: string | null }[];
  studentCount: number;
}

interface EditGroupState {
  open: boolean;
  mode: "add" | "edit";
  group: GroupData | null;
  submitting: boolean;
  hasConflict: boolean;
  openDrawer: (group: GroupData) => void;
  openAddDrawer: () => void;
  closeDrawer: () => void;
  setSubmitting: (v: boolean) => void;
  setHasConflict: (v: boolean) => void;
}

export const useEditGroup = create<EditGroupState>((set) => ({
  open: false,
  mode: "edit",
  group: null,
  submitting: false,
  hasConflict: false,
  openDrawer: (group) => set({ open: true, mode: "edit", group }),
  openAddDrawer: () => set({ open: true, mode: "add", group: null }),
  closeDrawer: () => set({ open: false, group: null, submitting: false, hasConflict: false }),
  setSubmitting: (v) => set({ submitting: v }),
  setHasConflict: (v) => set({ hasConflict: v }),
}));
