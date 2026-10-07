import type { TaskCard } from "@/hooks/use-tasks";

/** Who sees the «Topshiriqlar» panel on an entity page: CEO, Branch Director, Administrator. */
export const ENTITY_PANEL_ROLES = [1, 2, 3];

/**
 * `GET /tasks?view=all` is refused (403) to anyone but a CEO (branch scope «all») or a person whose
 * highest staff role is Branch Director — `list()` in tasks-read.service.ts. Both carry role 1 or 2.
 */
const ALL_VIEW_ROLES = [1, 2];

/** The list the panel reads: everything on the entity for a manager, else what is assigned to the viewer. */
export function panelView(roleIds: number[]): "all" | "my" {
  return roleIds.some((id) => ALL_VIEW_ROLES.includes(id)) ? "all" : "my";
}

/** «Tizim · Ali V., Vali K.»: a system-made task says so; then who holds it. */
export function taskMeta(t: Pick<TaskCard, "kind" | "assignees">): string {
  const people = t.assignees.map((a) => `${a.firstName} ${a.lastName.charAt(0)}.`).join(", ");
  return [t.kind !== "MANUAL" ? "Tizim" : "", people].filter(Boolean).join(" · ");
}

/** A count from one page of results: «20+» when the server says there is more. */
export function countLabel(n: number, more: boolean): string {
  return more ? `${n}+` : String(n);
}
