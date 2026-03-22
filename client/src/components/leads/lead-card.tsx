"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, parseISO } from "date-fns";
import { UserPlus, Phone, CalendarDays } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Lead } from "@/data/lead-model";
import { useAddStudentFromLead } from "@/hooks/use-add-student-from-lead";
import { cn } from "@/lib/utils";

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 9) return `+998 ${raw}`;
  return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}

interface LeadCardProps {
  lead: Lead;
  isOverlay?: boolean;
}

export function LeadCard({ lead, isOverlay }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: lead.id,
  });

  const { openDrawer } = useAddStudentFromLead();

  const initials = lead.firstName.charAt(0) + lead.lastName.charAt(0);

  const style = isOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      };

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay ? {} : { ...listeners, ...attributes })}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing",
        isOverlay && "shadow-lg ring-2 ring-primary/20 rotate-2"
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarImage src={lead.avatar} alt={lead.firstName} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {lead.firstName} {lead.lastName}
          </p>

          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="size-3 shrink-0" />
            <span>{formatPhone(lead.phone)}</span>
          </div>

          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3 shrink-0" />
            <span>{format(parseISO(lead.registeredAt), "dd.MM.yyyy")}</span>
          </div>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 mt-0.5"
              onClick={(e) => {
                e.stopPropagation();
                openDrawer(lead);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <UserPlus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>O&apos;quvchi sifatida qo&apos;shish</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
