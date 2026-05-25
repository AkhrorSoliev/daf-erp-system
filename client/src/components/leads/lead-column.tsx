"use client";

import {
  ArrowLeft,
  ArrowRight,
  FolderPlus,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLeadsBoard, type LeadBoardColumn } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { LeadSection } from "./lead-section";

interface LeadColumnProps {
  column: LeadBoardColumn;
  canMoveLeft: boolean;
  canMoveRight: boolean;
}

export function LeadColumn({
  column,
  canMoveLeft,
  canMoveRight,
}: LeadColumnProps) {
  const moveColumn = useLeadsBoard((s) => s.moveColumn);
  const openCreateSection = useLeadsUi((s) => s.openCreateSection);
  const openRename = useLeadsUi((s) => s.openRename);
  const openDelete = useLeadsUi((s) => s.openDelete);

  const totalLeads = column.sections.reduce((sum, s) => sum + s.leadCount, 0);

  return (
    <div className="flex h-full w-80 min-w-80 shrink-0 flex-col rounded-lg border bg-muted/30">
      <div className="flex shrink-0 items-center justify-between gap-1 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
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

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2">
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
          column.sections.map((section, index) => (
            <LeadSection
              key={section.id}
              section={section}
              columnId={column.id}
              canMoveUp={index > 0}
              canMoveDown={index < column.sections.length - 1}
            />
          ))
        )}
      </div>
    </div>
  );
}
