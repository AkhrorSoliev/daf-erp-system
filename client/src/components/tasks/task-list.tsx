"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTasks, type TaskStatus } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "./task-labels";
import { groupByDue } from "./task-due";
import { TaskCard } from "./task-card";

const LISTED: TaskStatus[] = ["NEW", "IN_PROGRESS", "IN_REVIEW"];
const GRID = "grid gap-2 sm:grid-cols-2 lg:grid-cols-3";

export function TaskList({ showAssignees }: { showAssignees: boolean }) {
  const columns = useTasks((s) => s.columns);
  const fetchColumn = useTasks((s) => s.fetchColumn);
  const open = [...columns.NEW.items, ...columns.IN_PROGRESS.items];
  const review = columns.IN_REVIEW.items;
  const groups = groupByDue(open, new Date());
  const withMore = LISTED.filter((s) => columns[s].cursor);
  const loading = LISTED.some((s) => columns[s].loading);

  if (open.length === 0 && review.length === 0 && LISTED.some((s) => columns[s].reqId === 0 || columns[s].loading)) {
    return <div className={GRID}>{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h3 className={cn("text-sm font-semibold", g.key === "overdue" && "text-red-700 dark:text-red-400")}>{g.label} <span className="text-muted-foreground font-normal">{g.items.length}</span></h3>
          <div className={GRID}>{g.items.map((t) => <TaskCard key={t.id} task={t} dragEnabled={false} showAssignees={showAssignees} />)}</div>
        </section>
      ))}
      {review.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-400">{STATUS_LABEL.IN_REVIEW} <span className="text-muted-foreground font-normal">{review.length}</span></h3>
          <div className={GRID}>{review.map((t) => <TaskCard key={t.id} task={t} dragEnabled={false} showAssignees={showAssignees} />)}</div>
        </section>
      )}
      {groups.length === 0 && review.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Ochiq topshiriqlar yo&apos;q</p>}
      {withMore.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => withMore.forEach((s) => void fetchColumn(s, { more: true }))}>Yana</Button>
        </div>
      )}
    </div>
  );
}
