import { create } from "zustand";
import type { TaskCreateContext } from "./task-create-dialog";

interface EntityContextState {
  /** The entity page now open (Student, Group, …); `pathname` ties it to that page. */
  context: (TaskCreateContext & { pathname: string }) | null;
  set: (ctx: TaskCreateContext & { pathname: string }) => void;
  clear: () => void;
}

/** An entity page publishes itself here so the header «+ Topshiriq» pre-fills the link. */
export const useEntityContext = create<EntityContextState>((set) => ({
  context: null,
  set: (context) => set({ context }),
  clear: () => set({ context: null }),
}));
