"use client";

import { useState } from "react";
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import toast from "react-hot-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useTasks, type TaskCard as TaskCardData, type TaskDetail, type TaskStatus } from "@/hooks/use-tasks";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { STATUS_COLUMNS, STATUS_LABEL } from "./task-labels";
import { judgeDrop } from "./task-drop";
import { TaskColumn } from "./task-column";
import { TaskCard } from "./task-card";

interface Props { dragEnabled: boolean; showAssignees: boolean }

export function TaskBoard({ dragEnabled, showAssignees }: Props) {
  const columns = useTasks((s) => s.columns);
  const fetchColumn = useTasks((s) => s.fetchColumn);
  const patchTask = useTasks((s) => s.patchTask);
  const refreshTask = useTasks((s) => s.refreshTask);
  const userId = useAuth((s) => s.user?.id);
  const [active, setActive] = useState<TaskCardData | null>(null);
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set());
  const [pending, setPending] = useState<{ task: TaskCardData; to: TaskStatus } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const findCard = (id: string | number) => STATUS_COLUMNS.flatMap((c) => columns[c.id].items).find((t) => t.id === id);

  function toggle(status: TaskStatus) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(status)) next.add(status);
      return next;
    });
  }

  function onDragStart(e: DragStartEvent) {
    if (dragEnabled) setActive(findCard(e.active.id) ?? null);
  }

  function onDragEnd({ active: dragged, over }: DragEndEvent) {
    setActive(null);
    const task = findCard(dragged.id);
    const to = STATUS_COLUMNS.find((c) => c.id === over?.id)?.id;
    if (!dragEnabled || !task || !to) return;
    const verdict = judgeDrop(task, to, userId);
    if (verdict.kind === "toast") toast.error(verdict.message);
    else if (verdict.kind === "confirm") setPending({ task, to });
  }

  async function confirmMove() {
    if (!pending) return;
    const { task, to } = pending;
    setPending(null);
    try {
      const { data } = await api.post<TaskDetail>(`/tasks/${task.id}/status`, { status: to });
      patchTask(data);
    } catch (error) {
      toast.error(getErrorMessage(error, "Holatni o'zgartirishda xatolik"));
      // The server may have moved or dropped the card meanwhile (another
      // assignee took a system task): show what it holds.
      void refreshTask(task.id);
    }
  }

  // Nothing has answered yet: every column is empty and either loading or not asked.
  const booting = STATUS_COLUMNS.every((c) => columns[c.id].items.length === 0 && (columns[c.id].loading || columns[c.id].reqId === 0));
  if (booting) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUS_COLUMNS.map((c) => (
          <div key={c.id} className="flex w-72 min-w-72 shrink-0 flex-col rounded-lg border bg-muted/30 p-3">
            <div className="mb-3 flex items-center justify-between"><Skeleton className="h-5 w-24" /><Skeleton className="h-5 w-8" /></div>
            <div className="flex flex-col gap-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>
          </div>
        ))}
      </div>
    );
  }

  const title = pending ? (pending.task.title.length > 50 ? `${pending.task.title.slice(0, 50)}…` : pending.task.title) : "";

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_COLUMNS.map(({ id }) => (
            <TaskColumn
              key={id}
              status={id}
              items={columns[id].items}
              loading={columns[id].loading}
              cursor={columns[id].cursor}
              onMore={() => void fetchColumn(id, { more: true })}
              collapsed={collapsed.has(id)}
              onToggle={() => toggle(id)}
              dragEnabled={dragEnabled}
              showAssignees={showAssignees}
            />
          ))}
        </div>
        <DragOverlay>{active ? <TaskCard task={active} isOverlay dragEnabled={false} showAssignees={showAssignees} /> : null}</DragOverlay>
      </DndContext>

      <AlertDialog open={!!pending} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Holatni o&apos;zgartirish</AlertDialogTitle>
            <AlertDialogDescription>
              «{title}» topshirig&apos;i holatini <strong>{pending ? STATUS_LABEL[pending.task.status] : ""}</strong> dan <strong>{pending ? STATUS_LABEL[pending.to] : ""}</strong> ga o&apos;zgartirmoqchimisiz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmMove()}>Tasdiqlash</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
