import { ROLE_LABEL, ROLE_ORDER } from "./task-labels";

/** `GET /tasks/workload`: rows already sorted by overdue, then open. */
export interface WorkloadRow {
  user: { id: number; firstName: string; lastName: string; photo: string | null; roleNames: string[]; branchNames: string[] };
  open: number; overdue: number; doneThisMonth: number; onTimePercent: number | null;
}
export interface WorkloadData { month: string; data: WorkloadRow[]; totals: { open: number; overdue: number; doneThisMonth: number } }

// The server sends per-person shares only, so the company figure is their mean weighted by the tasks each closed
// (not by those with a due date): an approximation of ΣonTime/ΣwithDue. Null when no row has a share.
export function onTimeTile(rows: Pick<WorkloadRow, "doneThisMonth" | "onTimePercent">[]): number | null {
  let weight = 0;
  let sum = 0;
  for (const r of rows) {
    if (r.onTimePercent === null) continue;
    weight += r.doneThisMonth;
    sum += r.doneThisMonth * r.onTimePercent;
  }
  return weight > 0 ? Math.round(sum / weight) : null;
}

/** «Ustoz · Farg'ona»: the person's highest role (as the assignee picker lists them) and their branches. */
export function personLine(u: Pick<WorkloadRow["user"], "roleNames" | "branchNames">): string {
  const top = ROLE_ORDER.find((r) => u.roleNames.includes(r));
  return [top ? ROLE_LABEL[top] : "", u.branchNames.join(", ")].filter(Boolean).join(" · ");
}

/** Where a row leads: «Barchasi» narrowed to that person (the table reads `assignee` once on mount). */
export const allTabHref = (userId: number) => `/tasks?tab=all&assignee=${userId}`;
