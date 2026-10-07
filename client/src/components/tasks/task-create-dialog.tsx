"use client";
import { create } from "zustand";

// Stub: Task 13 replaces this file with the real dialog.
interface TaskCreateState {
  isOpen: boolean;
  context: { entityType?: string; entityId?: string; entityLabel?: string };
  open: (ctx: TaskCreateState["context"]) => void;
  close: () => void;
}
export const useTaskCreate = create<TaskCreateState>((set) => ({
  isOpen: false,
  context: {},
  open: (context) => set({ isOpen: true, context }),
  close: () => set({ isOpen: false }),
}));
export const TaskCreateDialog = () => null;
