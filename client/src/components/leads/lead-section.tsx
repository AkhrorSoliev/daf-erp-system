"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLeadsBoard, type LeadBoardSection } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { LeadCardItem } from "./lead-card";

interface LeadSectionProps {
  section: LeadBoardSection;
  columnId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function LeadSection({
  section,
  columnId,
  canMoveUp,
  canMoveDown,
}: LeadSectionProps) {
  const [open, setOpen] = useState(false);
  const fetchSectionLeads = useLeadsBoard((s) => s.fetchSectionLeads);
  const moveSection = useLeadsBoard((s) => s.moveSection);
  const leads = useLeadsBoard((s) => s.leadsBySection[section.id]);
  const loading = useLeadsBoard((s) => s.loadingSections.has(section.id));
  const openAddLead = useLeadsUi((s) => s.openAddLead);
  const openRename = useLeadsUi((s) => s.openRename);
  const openDelete = useLeadsUi((s) => s.openDelete);

  // The whole section is a drop target for leads dragged from elsewhere.
  const { setNodeRef, isOver } = useDroppable({ id: section.id });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Leads are loaded lazily the first time a section is expanded.
    if (next) fetchSectionLeads(section.id);
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md transition-shadow",
        isOver && "ring-2 ring-primary/50",
      )}
    >
      <Collapsible
        open={open}
        onOpenChange={handleOpenChange}
        className="rounded-md border bg-card"
      >
        <div className="flex items-center gap-0.5 px-1">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-2 text-left hover:bg-muted/50">
            <ChevronRight
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {section.name}
            </span>
            <span className="shrink-0 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
              {section.leadCount}
            </span>
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => openAddLead(section.id)}
          >
            <Plus className="size-4" />
            <span className="sr-only">Lid qo&apos;shish</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 shrink-0">
                <MoreVertical className="size-4" />
                <span className="sr-only">Bo&apos;lim amallari</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  openRename({
                    kind: "section",
                    id: section.id,
                    currentName: section.name,
                    columnId,
                  })
                }
              >
                <Pencil className="mr-2 size-4" />
                Tahrirlash
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canMoveUp}
                onClick={() => moveSection(columnId, section.id, "up")}
              >
                <ArrowUp className="mr-2 size-4" />
                Yuqoriga surish
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canMoveDown}
                onClick={() => moveSection(columnId, section.id, "down")}
              >
                <ArrowDown className="mr-2 size-4" />
                Pastga surish
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() =>
                  openDelete({
                    kind: "section",
                    id: section.id,
                    name: section.name,
                    columnId,
                  })
                }
              >
                <Trash2 className="mr-2 size-4" />
                O&apos;chirish
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CollapsibleContent className="space-y-1.5 px-2 pb-2">
          {loading ? (
            <>
              <Skeleton className="h-14 w-full rounded-md" />
              <Skeleton className="h-14 w-full rounded-md" />
            </>
          ) : !leads || leads.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-3 py-5 text-center">
              <p className="text-xs text-muted-foreground">
                Bu bo&apos;limda lid yo&apos;q
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => openAddLead(section.id)}
              >
                <Plus className="size-3.5" />
                Lid qo&apos;shish
              </Button>
            </div>
          ) : (
            leads.map((lead) => (
              <LeadCardItem
                key={lead.id}
                lead={lead}
                sectionId={section.id}
              />
            ))
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
