"use client";

import { GripVertical, Phone } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { formatPhone } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import type { LeadCard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";

function CardBody({ lead }: { lead: LeadCard }) {
  return (
    <>
      <p className="truncate text-sm font-medium">
        {lead.firstName} {lead.lastName}
      </p>
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Phone className="size-3" />
        {formatPhone(lead.phone)}
      </div>
      {lead.source && (
        <Badge variant="secondary" className="mt-1.5 text-[10px]">
          {lead.source.name}
        </Badge>
      )}
    </>
  );
}

interface LeadCardItemProps {
  lead: LeadCard;
  sectionId: string;
}

export function LeadCardItem({ lead, sectionId }: LeadCardItemProps) {
  const openLeadDetail = useLeadsUi((s) => s.openLeadDetail);
  const { setNodeRef, listeners, attributes, transform, isDragging } =
    useDraggable({ id: lead.id, data: { sectionId } });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-1.5 rounded-md border bg-card p-2.5 shadow-sm",
        isDragging && "opacity-40",
      )}
    >
      <button
        type="button"
        className="mt-0.5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="size-4" />
        <span className="sr-only">Ko&apos;chirish uchun ushlang</span>
      </button>
      <button
        type="button"
        onClick={() => openLeadDetail(lead.id)}
        className="min-w-0 flex-1 text-left transition-colors hover:text-primary"
      >
        <CardBody lead={lead} />
      </button>
    </div>
  );
}

/** Non-interactive copy rendered inside the DnD drag overlay. */
export function LeadCardOverlay({ lead }: { lead: LeadCard }) {
  return (
    <div className="flex items-start gap-1.5 rounded-md border bg-card p-2.5 shadow-lg ring-2 ring-primary/20">
      <span className="mt-0.5 text-muted-foreground">
        <GripVertical className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <CardBody lead={lead} />
      </div>
    </div>
  );
}
