"use client";
import { useTasks, type TaskCard } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";
import { personName } from "./task-feed-text";
import { TaskStatusPill } from "./task-status-pill";

/** An author's «Har biriga alohida» copies: who has which, and a way to move between them. */
export function TaskDrawerBatch({ copies, currentId }: { copies: TaskCard[]; currentId: string }) {
  const openTask = useTasks((s) => s.openTask);
  if (copies.length < 2) return null;
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">Nusxalar <span className="font-normal text-muted-foreground">{copies.length}</span></h4>
      <ul className="divide-y rounded-md border">
        {copies.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={c.id === currentId}
              onClick={() => openTask(c.id)}
              className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm", c.id === currentId ? "bg-muted/50" : "hover:bg-muted/50")}
            >
              <span className="truncate">{c.assignees.length ? c.assignees.map(personName).join(", ") : "—"}</span>
              <TaskStatusPill status={c.status} className="shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
