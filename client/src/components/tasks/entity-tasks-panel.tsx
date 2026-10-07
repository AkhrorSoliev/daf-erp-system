"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { hasAnyRole } from "@/lib/role-access";
import { useAuth } from "@/hooks/use-auth";
import { useTasks, type TaskCard } from "@/hooks/use-tasks";
import { useTaskCreate } from "./task-create-dialog";
import { STATUS_LABEL } from "./task-labels";
import { DueBadge } from "./task-card";
import { TaskDrawer } from "./task-drawer";
import { ENTITY_PANEL_ROLES, countLabel, taskMeta } from "./entity-tasks-panel-rules";

interface Props { entityType: string; entityId: string; entityLabel: string; className?: string }
interface Page { items: TaskCard[]; more: boolean }

// A create refetches the board column by column, bumping `version` each time;
// one read after the burst is enough.
const REREAD_DELAY_MS = 150;

function TaskRow({ task, onOpen }: { task: TaskCard; onOpen: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(task.id)} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-t py-2 text-left text-sm first:border-t-0">
      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{STATUS_LABEL[task.status]}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{task.title}</span>
        <span className="block text-[11px] text-muted-foreground">{taskMeta(task)}</span>
      </span>
      <DueBadge dueAt={task.dueAt} closedAt={task.closedAt} />
    </button>
  );
}

/** «Topshiriqlar» on a Student, Group, Lead or User page: the open tasks tied to it, the closed ones behind a link. */
export function EntityTasksPanel(props: Props) {
  const roles = useAuth((s) => s.user?.roles);
  if (!hasAnyRole(roles, ENTITY_PANEL_ROLES)) return null;
  // Another entity is another list: start from a clean state.
  return <Panel key={`${props.entityType}:${props.entityId}`} {...props} />;
}

function Panel({ entityType, entityId, entityLabel, className }: Props) {
  // `null` = still loading; "failed" = the first read did not go through.
  const [open, setOpen] = useState<Page | "failed" | null>(null);
  const [closed, setClosed] = useState<Page | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  // Which of the two lists has been shown once: a later failure keeps it and stays quiet.
  const shown = useRef({ open: false, closed: false });
  const openCreate = useTaskCreate((s) => s.open);
  const openTask = useTasks((s) => s.openTask);
  // Bumped on every card change (the drawer's writes, a new task), so the lists follow them.
  const version = useTasks((s) => s.version);

  useEffect(() => {
    let alive = true;
    // `view=all` is what this viewer may see: everything for a manager, else the tasks they wrote or take part in.
    const read = (status: string, closedDays?: number) =>
      api.get<{ data: TaskCard[]; nextCursor: string | null }>("/tasks", { params: { view: "all", entityType, entityId, status, closedDays, limit: 20 } })
        .then(({ data }): Page => ({ items: data.data, more: data.nextCursor !== null }));
    const fail = (error: unknown) => toast.error(getErrorMessage(error, "Topshiriqlarni yuklashda xatolik"), { id: "entity-tasks-read" });
    // The two lists load on their own: the closed one failing must not hide the open one.
    const run = () => {
      read("NEW,IN_PROGRESS,IN_REVIEW")
        .then((page) => { if (alive) { shown.current.open = true; setOpen(page); } })
        .catch((error) => { if (alive && !shown.current.open) { setOpen("failed"); fail(error); } });
      read("DONE,CANCELLED", 365)
        .then((page) => { if (alive) { shown.current.closed = true; setClosed(page); } })
        .catch((error) => { if (alive && !shown.current.closed) fail(error); });
    };
    if (!shown.current.open) {
      run();
      return () => { alive = false; };
    }
    const timer = setTimeout(run, REREAD_DELAY_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [entityType, entityId, version]);

  const page = open === "failed" ? null : open;
  return (
    <div className={cn("space-y-2 rounded-xl border bg-card p-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Topshiriqlar {page && <span className="font-normal text-muted-foreground">{countLabel(page.items.length, page.more)} ochiq</span>}
        </h3>
        <Button size="sm" variant="outline" className="h-7" onClick={() => openCreate({ entityType, entityId, entityLabel })}>
          <Plus className="mr-1 size-3" />Topshiriq
        </Button>
      </div>
      {open === null && <Skeleton className="h-10 w-full" />}
      {open === "failed" && <p className="text-xs text-muted-foreground">Topshiriqlarni yuklab bo&apos;lmadi</p>}
      {page && page.items.length === 0 && <p className="text-xs text-muted-foreground">Ochiq topshiriq yo&apos;q</p>}
      {page?.items.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}
      {closed && closed.items.length > 0 && (
        <button type="button" aria-expanded={showClosed} className="text-xs text-primary" onClick={() => setShowClosed(!showClosed)}>
          {showClosed ? "Yopilganlarni yashirish" : `Yopilganlar (${countLabel(closed.items.length, closed.more)})`}
        </button>
      )}
      {showClosed && closed?.items.map((t) => (
        <button key={t.id} type="button" onClick={() => openTask(t.id)} className="block w-full truncate border-t py-1.5 text-left text-xs text-muted-foreground">
          {STATUS_LABEL[t.status]} · {t.title}
        </button>
      ))}
      <TaskDrawer />
    </div>
  );
}
