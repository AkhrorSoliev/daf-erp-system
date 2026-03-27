import { create } from "zustand";

export interface Room {
  id: string;
  name: string;
  capacity: number | null;
  branchId: number;
  branchName: string;
  groupCount?: number;
}

interface EditRoomState {
  open: boolean;
  room: Room | null;
  isAdd: boolean;
  addBranchId: number | null;
  submitting: boolean;
  openDrawer: (room: Room) => void;
  openAddDrawer: (branchId: number) => void;
  closeDrawer: () => void;
  setSubmitting: (v: boolean) => void;
}

export const useEditRoom = create<EditRoomState>((set) => ({
  open: false,
  room: null,
  isAdd: false,
  addBranchId: null,
  submitting: false,
  openDrawer: (room) => set({ open: true, room, isAdd: false, addBranchId: null }),
  openAddDrawer: (branchId) =>
    set({ open: true, room: null, isAdd: true, addBranchId: branchId }),
  closeDrawer: () =>
    set({ open: false, room: null, isAdd: false, addBranchId: null }),
  setSubmitting: (v) => set({ submitting: v }),
}));
