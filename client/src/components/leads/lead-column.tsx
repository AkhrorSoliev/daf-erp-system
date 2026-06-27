"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ArrowLeft,
  ArrowRight,
  ChevronsLeft,
  ChevronsRight,
  FolderPlus,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLeadsBoard, type LeadBoardColumn } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { LeadSection } from "./lead-section";

interface LeadColumnProps {
  column: LeadBoardColumn;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function LeadColumn({
  column,
  canMoveLeft,
  canMoveRight,
  collapsed,
  onToggleCollapse,
}: LeadColumnProps) {
  const moveColumn = useLeadsBoard((s) => s.moveColumn);
  const openCreateSection = useLeadsUi((s) => s.openCreateSection);
  const openRename = useLeadsUi((s) => s.openRename);
  const openDelete = useLeadsUi((s) => s.openDelete);

  // The column body is a drop target for sections dragged from another column.
  const { setNodeRef, isOver, active } = useDroppable({
    id: column.id,
    data: { type: "column" },
  });
  const sectionOver = isOver && active?.data.current?.type === "section";

  const totalLeads = column.sections.reduce((sum, s) => sum + s.leadCount, 0);

  // Collapsed: a narrow vertical strip. Stays a drop target so a dragged section
  // can still be dropped into the column without expanding it first.
  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "flex h-full w-11 min-w-11 shrink-0 cursor-pointer flex-col items-center gap-3 rounded-lg border bg-muted/30 py-3 transition-colors",
          sectionOver && "bg-primary/5 ring-2 ring-inset ring-primary/40",
        )}
        onClick={onToggleCollapse}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse();
              }}
            >
              <ChevronsRight className="size-4" />
              <span className="sr-only">Ustunni ochish</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Ustunni ochish</TooltipContent>
        </Tooltip>

        <span className="shrink-0 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
          {totalLeads}
        </span>

        <span className="min-h-0 select-none overflow-hidden text-sm font-semibold [writing-mode:vertical-lr]">
          {column.name}
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-80 min-w-80 shrink-0 flex-col rounded-lg border bg-muted/30">
      <div className="flex shrink-0 items-center justify-between gap-1 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                onClick={onToggleCollapse}
              >
                <ChevronsLeft className="size-4" />
                <span className="sr-only">Ustunni yopish</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ustunni yopish</TooltipContent>
          </Tooltip>
          <h2 className="truncate text-sm font-semibold">{column.name}</h2>
          <span className="shrink-0 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
            {totalLeads}
          </span>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => openCreateSection(column.id, column.name)}
          >
            <FolderPlus className="size-3.5" />
            Bo&apos;lim
          </Button>
          {!column.isSystem && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7">
                  <MoreVertical className="size-4" />
                  <span className="sr-only">Ustun amallari</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    openRename({
                      kind: "column",
                      id: column.id,
                      currentName: column.name,
                    })
                  }
                >
                  <Pencil className="mr-2 size-4" />
                  Tahrirlash
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canMoveLeft}
                  onClick={() => moveColumn(column.id, "left")}
                >
                  <ArrowLeft className="mr-2 size-4" />
                  Chapga surish
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canMoveRight}
                  onClick={() => moveColumn(column.id, "right")}
                >
                  <ArrowRight className="mr-2 size-4" />
                  O&apos;ngga surish
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() =>
                    openDelete({
                      kind: "column",
                      id: column.id,
                      name: column.name,
                    })
                  }
                >
                  <Trash2 className="mr-2 size-4" />
                  O&apos;chirish
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2 transition-colors",
          sectionOver && "bg-primary/5 ring-2 ring-inset ring-primary/40",
        )}
      >
        {column.sections.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Bu ustunda hali bo&apos;lim yo&apos;q
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openCreateSection(column.id, column.name)}
            >
              <FolderPlus className="size-3.5" />
              Birinchi bo&apos;limni yarating
            </Button>
          </div>
        ) : (
          <SortableContext
            items={column.sections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {column.sections.map((section, index) => (
              <LeadSection
                key={section.id}
                section={section}
                columnId={column.id}
                canMoveUp={index > 0}
                canMoveDown={index < column.sections.length - 1}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}
