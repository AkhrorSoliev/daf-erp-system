import { ROLE_LABEL, ROLE_ORDER } from "./task-labels";

/** `GET /tasks/workload`: rows already sorted by overdue, then open. */
export interface WorkloadRow {
  user: { id: number; firstName: string; lastName: string; photo: string | null; roleNames: string[]; branchNames: string[] };
  open: number; overdue: number; doneThisMonth: number; onTimePercent: number | null;
}
export interface WorkloadTotals { open: number; overdue: number; doneThisMonth: number; onTime: number; withDue: number }
export interface WorkloadData { month: string; data: WorkloadRow[]; totals: WorkloadTotals }

/** The company-wide share of tasks closed by their due date, among those closed this month that had one; null when none had. */
export function onTimeTile(totals: Pick<WorkloadTotals, "onTime" | "withDue">): number | null {
  return totals.withDue > 0 ? Math.round((100 * totals.onTime) / totals.withDue) : null;
}

/** «Ustoz · Farg'ona»: the person's highest role (as the assignee picker lists them) and their branches. */
export function personLine(u: Pick<WorkloadRow["user"], "roleNames" | "branchNames">): string {
  const top = ROLE_ORDER.find((r) => u.roleNames.includes(r));
  return [top ? ROLE_LABEL[top] : "", u.branchNames.join(", ")].filter(Boolean).join(" · ");
}

/** Where a row leads: «Barchasi» narrowed to that person (the table reads `assignee` once on mount). */
export const allTabHref = (userId: number) => `/tasks?tab=all&assignee=${userId}`;
