import type { TaskCard } from "@/hooks/use-tasks";

/** Who sees the «Topshiriqlar» panel on an entity page: CEO, Branch Director, Administrator. */
export const ENTITY_PANEL_ROLES = [1, 2, 3];

/**
 * «Tizim · Ali V., Vali K. · 1/3 bajardi»: a system-made task says so; then who holds it;
 * then, for separate copies the server collapsed into one card, how many are done.
 */
export function taskMeta(t: Pick<TaskCard, "kind" | "assignees" | "batch">): string {
  const people = t.assignees.map((a) => `${a.firstName} ${a.lastName.charAt(0)}.`).join(", ");
  const progress = t.batch ? `${t.batch.done}/${t.batch.total} bajardi` : "";
  return [t.kind !== "MANUAL" ? "Tizim" : "", people, progress].filter(Boolean).join(" · ");
}

/** A count from one page of results: «20+» when the server says there is more. */
export function countLabel(n: number, more: boolean): string {
  return more ? `${n}+` : String(n);
}
