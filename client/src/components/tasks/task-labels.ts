import type { TaskKind, TaskPriority, TaskStatus } from "@/hooks/use-tasks";
import { msg } from "@/i18n/msg";
import { interpolate, type Params } from "@/i18n/translate";

/**
 * The page's `t` from `useT()`. The helpers of this folder take it as an optional last
 * argument; without it they read the Uzbek source as written (placeholders filled).
 */
export type Translate = (source: string, params?: Params) => string;
export const uzbek: Translate = interpolate;

// msg() texts: a component draws them with t(). «Yangi berilgan» and «Bekor etilgan»
// are task statuses: «Yangi» and «Bekor qilingan» already mean other things in the dictionary.
export const STATUS_LABEL: Record<TaskStatus, string> = {
  NEW: msg("Yangi berilgan"), IN_PROGRESS: msg("Jarayonda"), IN_REVIEW: msg("Tekshiruvda"), DONE: msg("Bajarildi"), CANCELLED: msg("Bekor etilgan"),
};
/** A task in one of these can still be edited and moved; DONE and CANCELLED are closed for good. */
export const isOpenStatus = (s: TaskStatus) => s === "NEW" || s === "IN_PROGRESS" || s === "IN_REVIEW";
export const STATUS_COLUMNS: { id: TaskStatus; label: string; dot: string }[] = [
  { id: "NEW", label: STATUS_LABEL.NEW, dot: "bg-gray-400" },
  { id: "IN_PROGRESS", label: STATUS_LABEL.IN_PROGRESS, dot: "bg-blue-500" },
  { id: "IN_REVIEW", label: STATUS_LABEL.IN_REVIEW, dot: "bg-violet-500" },
  { id: "DONE", label: STATUS_LABEL.DONE, dot: "bg-emerald-500" },
];
export const PRIORITY_LABEL: Record<TaskPriority, string> = { LOW: msg("Past"), MEDIUM: msg("O'rta"), HIGH: msg("Yuqori"), URGENT: msg("Shoshilinch") };
export const PRIORITY_CLASS: Record<TaskPriority, string> = {
  URGENT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  LOW: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400",
};
export const KIND_LABEL: Record<TaskKind, string> = {
  MANUAL: "", LESSON_QUESTION: msg("Dars bo'ldimi?"), CALLBACK: msg("Qayta qo'ng'iroq"), BROKEN_PROMISE: msg("Buzilgan va'da"), UNCALLED_LEAD: msg("Qo'ng'iroqsiz lid"),
  JOIN_REQUEST: msg("O'quvchi so'rovi"),
};
export const ENTITY_LABEL: Record<string, string> = { Student: msg("O'quvchi"), User: msg("Xodim"), Group: msg("Guruh"), Lead: msg("Lid") };
/** Role names as the server sends them, highest first, and how they read on screen. */
export const ROLE_ORDER = ["CEO", "Branch Director", "Administrator", "Cashier", "Teacher"];
export const ROLE_LABEL: Record<string, string> = { CEO: msg("Rahbar"), "Branch Director": msg("Filial direktori"), Administrator: msg("Administrator"), Cashier: msg("Kassir"), Teacher: msg("Ustoz") };
/** Who made a system task (author `null`), and its badge; «Tizim» alone is the colour mode. */
export const SYSTEM_LABEL = msg("Tizim (avtomatik)");

// The labels above in the page's language (a lookup cannot go straight into t()).
export function statusText(status: TaskStatus, t: Translate = uzbek): string {
  const label = STATUS_LABEL[status];
  return t(label);
}
export function priorityText(priority: TaskPriority, t: Translate = uzbek): string {
  const label = PRIORITY_LABEL[priority];
  return t(label);
}
/** "" for a manual task. */
export function kindText(kind: TaskKind, t: Translate = uzbek): string {
  const label = KIND_LABEL[kind];
  return label ? t(label) : "";
}
/** An entity type the client does not know is shown as the server sent it. */
export function entityText(type: string, t: Translate = uzbek): string {
  const label = ENTITY_LABEL[type];
  return label ? t(label) : type;
}
