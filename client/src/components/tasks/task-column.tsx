"use client";

import { useDroppable } from "@dnd-kit/core";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TaskItem, TaskStatus } from "@/hooks/use-tasks-board";
import { TaskCard } from "./task-card";
import { cn } from "@/lib/utils";

interface TaskColumnProps {
  status: TaskStatus;
  label: string;
  color: string;
  tasks: TaskItem[];
  collapsed: boolean;
  onToggle: () => void;
  isDragDisabled: boolean;
}

export function TaskColumn({
  status,
  label,
  color,
  tasks,
  collapsed,
  onToggle,
  isDragDisabled,
}: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "flex w-10 min-w-10 shrink-0 flex-col items-center rounded-lg border bg-muted/30 py-3 cursor-pointer",
          isOver && "ring-2 ring-primary/20 bg-accent/50"
        )}
        onClick={onToggle}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 mb-2"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              <ChevronsRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Ustunni ochish</TooltipContent>
        </Tooltip>

        <Badge variant="secondary" className="mb-3 shrink-0">
          {tasks.length}
        </Badge>

        <span className="text-xs font-semibold [writing-mode:vertical-lr] rotate-180 select-none">
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-80 min-w-80 shrink-0 flex-col rounded-lg border bg-muted/30 p-3",
        isOver && "ring-2 ring-primary/20 bg-accent/50"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", color)} />
          <h3 className="text-sm font-semibold truncate">{label}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="secondary">{tasks.length}</Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onToggle}
              >
                <ChevronsLeft className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ustunni yopish</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-col gap-2 min-h-25">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            isDragDisabled={isDragDisabled}
          />
        ))}
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            Topshiriqlar yo&apos;q
          </p>
        )}
      </div>
    </div>
  );
}
