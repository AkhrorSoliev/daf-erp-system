import { useEffect } from "react";
import { usePathname } from "next/navigation";
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

/**
 * Publishes the entity page that is open, and withdraws it when the page goes.
 * `entityId` is `null` while the page is still loading (or a drawer is shut): nothing is published then.
 */
export function usePublishEntity(entityType: string, entityId: string | null, entityLabel: string) {
  const pathname = usePathname();
  const set = useEntityContext((s) => s.set);
  const clear = useEntityContext((s) => s.clear);
  useEffect(() => {
    if (entityId === null) return;
    set({ entityType, entityId, entityLabel, pathname });
    return clear;
  }, [entityType, entityId, entityLabel, pathname, set, clear]);
}
