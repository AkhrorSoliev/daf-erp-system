import type { TaskCard, TaskStatus } from "@/hooks/use-tasks";

export type DropVerdict = { kind: "skip" } | { kind: "confirm" } | { kind: "toast"; message: string };

const SKIP: DropVerdict = { kind: "skip" };
const CONFIRM: DropVerdict = { kind: "confirm" };
const refuse = (message: string): DropVerdict => ({ kind: "toast", message });

/**
 * What dropping a «Menga berilgan» card on the `to` column does. The server
 * has the last word (checkTransition); this only avoids asking for a
 * confirmation that can end in nothing but a refusal.
 */
export function judgeDrop(task: TaskCard, to: TaskStatus, userId: number | undefined): DropVerdict {
  if (to === task.status) return SKIP;
  // A system task is closed by the system; the assignee can only start it.
  if (task.kind !== "MANUAL") return to === "IN_PROGRESS" ? CONFIRM : refuse("Bu topshiriqni tizim o'zi yopadi");
  if (to === "DONE") {
    const selfTask = userId !== undefined && task.author?.id === userId && task.assignees.length === 1 && task.assignees[0].id === userId;
    return selfTask ? CONFIRM : refuse("Bajardim deb belgilash uchun «Tekshiruvga yuborish» ni bosing");
  }
  return CONFIRM;
}
