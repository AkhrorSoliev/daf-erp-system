import type { TaskCard } from "@/hooks/use-tasks";
import { SYSTEM_LABEL, uzbek, type Translate } from "./task-labels";

/** Who sees the «Topshiriqlar» panel on an entity page: CEO, Branch Director, Administrator. */
export const ENTITY_PANEL_ROLES = [1, 2, 3];

/**
 * «Tizim (avtomatik) · Ali V., Vali K. · 1/3 bajardi»: a system-made task says so; then who holds it;
 * then, for separate copies the server collapsed into one card, how many are done.
 */
export function taskMeta(task: Pick<TaskCard, "kind" | "assignees" | "batch">, t: Translate = uzbek): string {
  const people = task.assignees.map((a) => `${a.firstName} ${a.lastName.charAt(0)}.`).join(", ");
  const progress = task.batch ? t("{done}/{total} bajardi", { done: task.batch.done, total: task.batch.total }) : "";
  return [task.kind !== "MANUAL" ? t(SYSTEM_LABEL) : "", people, progress].filter(Boolean).join(" · ");
}

/** A count from one page of results: «20+» when the server says there is more. */
export function countLabel(n: number, more: boolean): string {
  return more ? `${n}+` : String(n);
}
