"use client";

import { useEffect, useState } from "react";
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
import { ENTITY_PANEL_ROLES, countLabel, panelView, taskMeta } from "./entity-tasks-panel-rules";

interface Props { entityType: string; entityId: string; entityLabel: string; className?: string }
interface Page { items: TaskCard[]; more: boolean }
interface Loaded { open: Page; closed: Page }

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
  return <Panel {...props} view={panelView(roles?.map((r) => r.id) ?? [])} />;
}

function Panel({ entityType, entityId, entityLabel, className, view }: Props & { view: "all" | "my" }) {
  // `null` = still loading; "failed" = the read did not go through.
  const [loaded, setLoaded] = useState<Loaded | "failed" | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const openCreate = useTaskCreate((s) => s.open);
  const openTask = useTasks((s) => s.openTask);
  // Bumped on every card change (the drawer's writes, a new task), so the list follows them.
  const version = useTasks((s) => s.version);

  useEffect(() => {
    let alive = true;
    const read = (status: string, closedDays?: number) =>
      api.get<{ data: TaskCard[]; nextCursor: string | null }>("/tasks", { params: { view, entityType, entityId, status, closedDays, limit: 20 } })
        .then(({ data }): Page => ({ items: data.data, more: data.nextCursor !== null }));
    Promise.all([read("NEW,IN_PROGRESS,IN_REVIEW"), read("DONE,CANCELLED", 365)])
      .then(([open, closed]) => { if (alive) setLoaded({ open, closed }); })
      .catch((error) => {
        if (!alive) return;
        setLoaded("failed");
        toast.error(getErrorMessage(error, "Topshiriqlarni yuklashda xatolik"));
      });
    return () => { alive = false; };
  }, [view, entityType, entityId, version]);

  const data = loaded === "failed" ? null : loaded;
  return (
    <div className={cn("space-y-2 rounded-xl border bg-card p-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Topshiriqlar {data && <span className="font-normal text-muted-foreground">{countLabel(data.open.items.length, data.open.more)} ochiq</span>}
        </h3>
        <Button size="sm" variant="outline" className="h-7" onClick={() => openCreate({ entityType, entityId, entityLabel })}>
          <Plus className="mr-1 size-3" />Topshiriq
        </Button>
      </div>
      {loaded === null && <Skeleton className="h-10 w-full" />}
      {loaded === "failed" && <p className="text-xs text-muted-foreground">Topshiriqlarni yuklab bo&apos;lmadi</p>}
      {data && data.open.items.length === 0 && <p className="text-xs text-muted-foreground">Ochiq topshiriq yo&apos;q</p>}
      {data?.open.items.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}
      {data && data.closed.items.length > 0 && (
        <button type="button" className="text-xs text-primary" onClick={() => setShowClosed(!showClosed)}>
          {showClosed ? "Yopilganlarni yashirish" : `Yopilganlar (${countLabel(data.closed.items.length, data.closed.more)})`}
        </button>
      )}
      {showClosed && data?.closed.items.map((t) => (
        <button key={t.id} type="button" onClick={() => openTask(t.id)} className="block w-full truncate border-t py-1.5 text-left text-xs text-muted-foreground">
          {STATUS_LABEL[t.status]} · {t.title}
        </button>
      ))}
      <TaskDrawer />
    </div>
  );
}
