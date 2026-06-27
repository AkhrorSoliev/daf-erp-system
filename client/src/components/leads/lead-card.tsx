"use client";

import {
  GripVertical,
  MessageSquareText,
  Phone,
  PhoneCall,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, parseISO } from "date-fns";
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
import { useLeadActivity } from "@/hooks/use-lead-activity";

// Slight delay so a quick mouse pass over a card doesn't fire the hover request.
const HOVER_DELAY = 250;

function fmtDateTime(iso: string) {
  return format(parseISO(iso), "dd.MM.yyyy, HH:mm");
}

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

/** Tooltip body for the "called" marker — caller (lazy) + when (instant). */
function CallTooltipBody({ lead }: { lead: LeadCard }) {
  const summary = useLeadActivity((s) => s.summaries[lead.id]);
  const errored = useLeadActivity((s) => s.errored[lead.id]);

  const who = summary
    ? (summary.calledBy?.name ?? "Noma'lum")
    : errored
      ? "—"
      : "Yuklanmoqda…";

  return (
    <div className="block max-w-[220px] text-left">
      <p className="font-medium">Telefon qilingan</p>
      <p className="opacity-80">
        {who}
        {lead.calledAt ? ` · ${fmtDateTime(lead.calledAt)}` : ""}
      </p>
    </div>
  );
}

/** Tooltip body for the comment marker — the latest comment, lazily loaded. */
function CommentTooltipBody({ lead }: { lead: LeadCard }) {
  const summary = useLeadActivity((s) => s.summaries[lead.id]);
  const errored = useLeadActivity((s) => s.errored[lead.id]);
  const older = lead.commentCount - 1;

  if (!summary) {
    return (
      <p className="block max-w-[240px] text-left opacity-80">
        {errored ? "Ma'lumotni yuklab bo'lmadi" : "Yuklanmoqda…"}
      </p>
    );
  }

  const c = summary.latestComment;
  if (!c) {
    return (
      <p className="block max-w-[240px] text-left opacity-80">
        Izoh yo&apos;q
      </p>
    );
  }

  return (
    <div className="block max-w-[240px] space-y-1 text-left">
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{c.authorName}</span>
        {c.isTask && (
          <span className="rounded bg-amber-400 px-1 text-[10px] font-medium text-amber-950">
            Vazifa
          </span>
        )}
      </div>
      <p className="line-clamp-4 whitespace-pre-wrap break-words opacity-90">
        {c.content}
      </p>
      <p className="opacity-60">
        {fmtDateTime(c.createdAt)}
        {older > 0 ? ` · +${older} ta oldingi izoh` : ""}
      </p>
    </div>
  );
}

/**
 * Top-right activity markers: a green phone when the lead has been called and a
 * blue speech-bubble (with count) when it has comments. Hovering either fires a
 * single, cached `hover-summary` request; the comment marker also opens the
 * detail drawer straight on the "Izohlar" tab when clicked.
 */
function LeadCardIndicators({ lead }: { lead: LeadCard }) {
  const hasCall = Boolean(lead.calledAt);
  const hasComment = lead.commentCount > 0;
  const openLeadDetail = useLeadsUi((s) => s.openLeadDetail);
  const fetchSummary = useLeadActivity((s) => s.fetchSummary);
  if (!hasCall && !hasComment) return null;

  const prime = (open: boolean) => {
    if (open) fetchSummary(lead.id);
  };

  return (
    <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
      {hasCall && (
        <Tooltip delayDuration={HOVER_DELAY} onOpenChange={prime}>
          <TooltipTrigger asChild>
            <span className="text-emerald-600 dark:text-emerald-400">
              <PhoneCall className="size-3.5" />
              <span className="sr-only">Telefon qilingan</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <CallTooltipBody lead={lead} />
          </TooltipContent>
        </Tooltip>
      )}
      {hasComment && (
        <Tooltip delayDuration={HOVER_DELAY} onOpenChange={prime}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => openLeadDetail(lead.id, "izohlar")}
              className="-m-0.5 flex items-center gap-0.5 rounded p-0.5 text-sky-600 transition-colors hover:bg-sky-500/10 dark:text-sky-400"
            >
              <MessageSquareText className="size-3.5" />
              <span className="text-[10px] font-medium tabular-nums">
                {lead.commentCount}
              </span>
              <span className="sr-only">Izohlarni ochish</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <CommentTooltipBody lead={lead} />
          </TooltipContent>
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
  const {
    setNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { type: "lead", sectionId } });

  // `transition` is what slides neighbouring cards aside to make room.
  const style = { transform: CSS.Transform.toString(transform), transition };

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
