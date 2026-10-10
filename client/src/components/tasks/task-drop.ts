import type { TaskCard, TaskStatus } from "@/hooks/use-tasks";

export type DropVerdict = { kind: "skip" } | { kind: "confirm" } | { kind: "toast"; message: string };

const SKIP: DropVerdict = { kind: "skip" };
const CONFIRM: DropVerdict = { kind: "confirm" };
const refuse = (message: string): DropVerdict => ({ kind: "toast", message });

/**
 * What dropping a «Menga berilgan» card on the `to` column does. This mirrors
 * the ASSIGNEE rows of the server's `checkTransition` (task-transitions.ts),
 * which has the last word: a drop the server would refuse is refused here with
 * its own wording, instead of after a confirmation.
 */
export function judgeDrop(task: TaskCard, to: TaskStatus, userId: number | undefined): DropVerdict {
  const from = task.status;
  if (to === from) return SKIP;
  if (from === "DONE") return refuse("Yopilgan topshiriq qayta ochilmaydi");
  // A system task is closed by the system; the assignee can only start it.
  if (task.kind !== "MANUAL") return to === "IN_PROGRESS" ? CONFIRM : refuse("Bu topshiriqni tizim o'zi yopadi");
  // Once sent to review, only the author moves it (accept or return).
  if (from === "IN_REVIEW") {
    return refuse(to === "DONE" ? "Tekshiruvdagi topshiriqni beruvchi qabul qiladi" : "Tekshiruvdagi topshiriqni beruvchi qaytaradi");
  }
  // An author who is the only assignee has no review step: start it or finish it.
  const selfTask = userId !== undefined && task.author?.id === userId && task.assignees.length === 1 && task.assignees[0].id === userId;
  if (selfTask) {
    return to === "DONE" || to === "IN_PROGRESS" ? CONFIRM : refuse("O'zingizga yozilgan topshiriqda tekshiruv bosqichi yo'q");
  }
  if (to === "DONE") return refuse("Bajardim deb belgilash uchun «Tekshiruvga yuborish» ni bosing");
  // No photo upload from the board: the drawer is where a photo is added.
  if (to === "IN_REVIEW") return task.requiresPhoto ? refuse("Tekshiruvga yuborish uchun rasm qo'shing") : CONFIRM;
  return to === "IN_PROGRESS" ? CONFIRM : refuse("Bu o'tish ijrochiga ruxsat etilmagan");
}
