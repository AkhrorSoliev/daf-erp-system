import type { TaskStatus } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";
import { STATUS_COLUMNS, STATUS_LABEL } from "./task-labels";

/** The status as a dot and a word; «Bekor qilingan» has no board column, so its dot is here. */
export function TaskStatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  const dot = status === "CANCELLED" ? "bg-red-500" : (STATUS_COLUMNS.find((c) => c.id === status)?.dot ?? "bg-gray-400");
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium", className)}>
      <span className={cn("size-2 rounded-full", dot)} />
      {STATUS_LABEL[status]}
    </span>
  );
}
