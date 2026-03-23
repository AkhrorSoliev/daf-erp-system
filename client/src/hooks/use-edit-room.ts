import { create } from "zustand";

export interface Room {
  id: string;
  name: string;
  capacity: number;
  branch: string;
  status: "active" | "inactive";
}

interface EditRoomState {
  open: boolean;
  room: Room | null;
  openDrawer: (room: Room) => void;
  closeDrawer: () => void;
}

export const useEditRoom = create<EditRoomState>((set) => ({
  open: false,
  room: null,
  openDrawer: (room) => set({ open: true, room }),
  closeDrawer: () => set({ open: false, room: null }),
}));
