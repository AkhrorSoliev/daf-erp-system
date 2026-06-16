"use client";

import {
  GripVertical,
  MessageSquareText,
  Phone,
  PhoneCall,
} from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

/**
 * Top-right activity markers: a green phone when the lead has been called and a
 * blue speech-bubble (with count) when it has comments. Rendered outside the
 * card's click button so the tooltip triggers aren't nested inside a button.
 */
function LeadCardIndicators({ lead }: { lead: LeadCard }) {
  const hasCall = Boolean(lead.calledAt);
  const hasComment = lead.commentCount > 0;
  if (!hasCall && !hasComment) return null;

  return (
    <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
      {hasCall && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-emerald-600 dark:text-emerald-400">
              <PhoneCall className="size-3.5" />
              <span className="sr-only">Telefon qilingan</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Telefon qilingan</TooltipContent>
        </Tooltip>
      )}
      {hasComment && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-0.5 text-sky-600 dark:text-sky-400">
              <MessageSquareText className="size-3.5" />
              <span className="text-[10px] font-medium tabular-nums">
                {lead.commentCount}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{lead.commentCount} ta izoh qoldirilgan</TooltipContent>
        </Tooltip>
      )}
    </div>
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
      <LeadCardIndicators lead={lead} />
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
      <LeadCardIndicators lead={lead} />
    </div>
  );
}
