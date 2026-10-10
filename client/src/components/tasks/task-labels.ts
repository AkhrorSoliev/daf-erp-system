import type { TaskKind, TaskPriority, TaskStatus } from "@/hooks/use-tasks";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  NEW: "Yangi", IN_PROGRESS: "Jarayonda", IN_REVIEW: "Tekshiruvda", DONE: "Bajarildi", CANCELLED: "Bekor qilingan",
};
/** A task in one of these can still be edited and moved; DONE and CANCELLED are closed for good. */
export const isOpenStatus = (s: TaskStatus) => s === "NEW" || s === "IN_PROGRESS" || s === "IN_REVIEW";
export const STATUS_COLUMNS: { id: TaskStatus; label: string; dot: string }[] = [
  { id: "NEW", label: "Yangi", dot: "bg-gray-400" },
  { id: "IN_PROGRESS", label: "Jarayonda", dot: "bg-blue-500" },
  { id: "IN_REVIEW", label: "Tekshiruvda", dot: "bg-violet-500" },
  { id: "DONE", label: "Bajarildi", dot: "bg-emerald-500" },
];
export const PRIORITY_LABEL: Record<TaskPriority, string> = { LOW: "Past", MEDIUM: "O'rta", HIGH: "Yuqori", URGENT: "Shoshilinch" };
export const PRIORITY_CLASS: Record<TaskPriority, string> = {
  URGENT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  LOW: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400",
};
export const KIND_LABEL: Record<TaskKind, string> = {
  MANUAL: "", LESSON_QUESTION: "Dars bo'ldimi?", CALLBACK: "Qayta qo'ng'iroq", BROKEN_PROMISE: "Buzilgan va'da", UNCALLED_LEAD: "Qo'ng'iroqsiz lid",
  JOIN_REQUEST: "O'quvchi so'rovi",
};
export const ENTITY_LABEL: Record<string, string> = { Student: "O'quvchi", User: "Xodim", Group: "Guruh", Lead: "Lid" };
/** Role names as the server sends them, highest first, and how they read on screen. */
export const ROLE_ORDER = ["CEO", "Branch Director", "Administrator", "Cashier", "Teacher"];
export const ROLE_LABEL: Record<string, string> = { CEO: "Rahbar", "Branch Director": "Filial direktori", Administrator: "Administrator", Cashier: "Kassir", Teacher: "Ustoz" };
