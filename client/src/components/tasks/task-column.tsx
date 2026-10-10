"use client";

import { useDroppable } from "@dnd-kit/core";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TaskCard as TaskCardData, TaskStatus } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";
import { STATUS_COLUMNS } from "./task-labels";
import { TaskCard } from "./task-card";

interface Props {
  status: TaskStatus;
  items: TaskCardData[];
  loading: boolean;
  cursor: string | null;
  onMore: () => void;
  collapsed: boolean;
  onToggle: () => void;
  dragEnabled: boolean;
  showAssignees: boolean;
}

export function TaskColumn({ status, items, loading, cursor, onMore, collapsed, onToggle, dragEnabled, showAssignees }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !dragEnabled });
  const { label, dot } = STATUS_COLUMNS.find((c) => c.id === status)!;
  // «+»: more cards wait behind the cursor.
  const count = `${items.length}${cursor ? "+" : ""}`;

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        className={cn("flex w-10 min-w-10 shrink-0 flex-col items-center rounded-lg border bg-muted/30 py-3 cursor-pointer", isOver && "ring-2 ring-primary/20 bg-accent/50")}
        onClick={onToggle}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs" className="shrink-0 mb-2" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
              <ChevronsRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Ustunni ochish</TooltipContent>
        </Tooltip>
        <Badge variant="secondary" className="mb-3 shrink-0">{count}</Badge>
        <span className="text-xs font-semibold [writing-mode:vertical-lr] rotate-180 select-none">{label}</span>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className={cn("flex w-72 min-w-72 shrink-0 flex-col rounded-lg border bg-muted/30 p-3", isOver && "ring-2 ring-primary/20 bg-accent/50")}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", dot)} />
          <h3 className="text-sm font-semibold truncate">{label}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="secondary">{count}</Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" onClick={onToggle}><ChevronsLeft className="size-4" /></Button>
            </TooltipTrigger>
            <TooltipContent>Ustunni yopish</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="flex flex-col gap-2 min-h-25">
        {items.map((t) => <TaskCard key={t.id} task={t} dragEnabled={dragEnabled} showAssignees={showAssignees} />)}
        {items.length === 0 && !loading && <p className="text-xs text-muted-foreground text-center py-8">Topshiriqlar yo&apos;q</p>}
        {cursor && <Button variant="ghost" size="sm" onClick={onMore} disabled={loading}>Yana</Button>}
        {status === "DONE" && <p className="text-[11px] text-muted-foreground text-center">Oxirgi 14 kun</p>}
      </div>
    </div>
  );
}
