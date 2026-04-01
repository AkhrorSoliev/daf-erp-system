"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useTasksBoard,
  TASK_COLUMNS,
  type TaskItem,
  type TaskStatus,
} from "@/hooks/use-tasks-board";
import { TaskColumn } from "./task-column";
import { TaskCard } from "./task-card";

const STATUS_ORDER: Record<TaskStatus, number> = {
  PENDING: 0,
  SEEN: 1,
  DONE: 2,
};

interface TaskKanbanBoardProps {
  loading: boolean;
  isDragDisabled: boolean;
}

export function TaskKanbanBoard({
  loading,
  isDragDisabled,
}: TaskKanbanBoardProps) {
  const { tasks, moveTask } = useTasksBoard();
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null);
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(
    new Set()
  );

  function toggleColumn(columnId: string) {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  function handleDragStart(event: DragStartEvent) {
    if (isDragDisabled) return;
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);

    if (isDragDisabled || !over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    const task = tasks.find((t) => t.id === activeId);
    if (!task) return;

    // Determine the target status
    let targetStatus: TaskStatus | null = null;

    // Check if dropped on a column
    const column = TASK_COLUMNS.find((c) => c.id === overId);
    if (column) {
      targetStatus = column.id;
    } else {
      // Dropped on another card — find its status
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        targetStatus = overTask.status;
      }
    }

    if (!targetStatus || targetStatus === task.status) return;

    // Only allow forward transitions
    if (STATUS_ORDER[targetStatus] <= STATUS_ORDER[task.status]) return;

    moveTask(activeId, targetStatus);
  }

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {TASK_COLUMNS.map((col) => (
          <div
            key={col.id}
            className="flex w-72 min-w-72 shrink-0 flex-col rounded-lg border bg-muted/30 p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-8" />
            </div>
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {TASK_COLUMNS.map((col) => {
          const columnTasks = tasks.filter((t) => t.status === col.id);
          return (
            <TaskColumn
              key={col.id}
              status={col.id}
              label={col.label}
              color={col.color}
              tasks={columnTasks}
              collapsed={collapsedColumns.has(col.id)}
              onToggle={() => toggleColumn(col.id)}
              isDragDisabled={isDragDisabled}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeTask ? (
          <TaskCard task={activeTask} isOverlay isDragDisabled={false} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
