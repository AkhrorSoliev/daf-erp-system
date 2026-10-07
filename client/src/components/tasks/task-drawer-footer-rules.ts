import type { TaskAccess, TaskDetail } from "@/hooks/use-tasks";

export interface FooterActions {
  /** «Boshladim»: NEW -> IN_PROGRESS. */
  start: boolean;
  /** «Bajardim», and where it sends the task: DONE for the author's own task, IN_REVIEW otherwise. */
  done: { target: "DONE" | "IN_REVIEW" } | null;
  /** «Qabul qilish» / «Qaytarish»: the author's review of a task in IN_REVIEW. */
  accept: boolean;
  return: boolean;
  /** A line instead of a button: the viewer is waiting for someone else. */
  label: string | null;
}

export const WAITING_LABEL = "Beruvchi tekshirmoqda";
const NONE: FooterActions = { start: false, done: null, accept: false, return: false, label: null };

/**
 * What the viewer may do with the task now, copied from the server
 * (task-transitions.ts, `changeStatusTx`, `reviewTx`): only an assignee moves a
 * task by status, a manager who is not one acts through review alone, and a
 * system task is only ever started by hand because it closes itself.
 */
export function footerActions(
  task: Pick<TaskDetail, "kind" | "status" | "author" | "assignees">,
  access: Pick<TaskAccess, "isAssignee" | "canManage">,
  meId: number | undefined,
): FooterActions {
  const system = task.kind !== "MANUAL";
  const working = access.isAssignee && (task.status === "NEW" || task.status === "IN_PROGRESS");
  // The author is the only assignee: their task skips the review step.
  const isSelf = meId !== undefined && task.author?.id === meId && task.assignees.length === 1 && task.assignees[0].id === meId;

  if (system) return working && task.status === "NEW" ? { ...NONE, start: true } : NONE;
  if (task.status === "IN_REVIEW") {
    if (access.canManage) return { ...NONE, accept: true, return: true };
    return access.isAssignee ? { ...NONE, label: WAITING_LABEL } : NONE;
  }
  if (!working) return NONE;
  return { ...NONE, start: task.status === "NEW", done: { target: isSelf ? "DONE" : "IN_REVIEW" } };
}
