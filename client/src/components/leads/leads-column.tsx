"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Lead, LeadStage } from "@/data/lead-model";
import { LeadCard } from "./lead-card";
import { cn } from "@/lib/utils";

interface LeadsColumnProps {
  stage: { id: LeadStage; title: string };
  leads: Lead[];
  collapsed: boolean;
  onToggle: () => void;
}

export function LeadsColumn({
  stage,
  leads,
  collapsed,
  onToggle,
}: LeadsColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  const leadIds = leads.map((l) => l.id);

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
          {leads.length}
        </Badge>

        <span className="text-xs font-semibold [writing-mode:vertical-lr] rotate-180 select-none">
          {stage.title}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 min-w-72 shrink-0 flex-col rounded-lg border bg-muted/30 p-3",
        isOver && "ring-2 ring-primary/20 bg-accent/50"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold truncate mr-2">{stage.title}</h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="secondary">{leads.length}</Badge>
          {stage.id !== "telegram_registration" && (
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
          )}
        </div>
      </div>

      <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 min-h-25">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
          {leads.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Lidlar yo&apos;q
            </p>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
