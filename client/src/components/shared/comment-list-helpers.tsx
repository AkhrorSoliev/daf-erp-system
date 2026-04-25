"use client";

import { format, formatDistanceToNow } from "date-fns";
import { uz } from "date-fns/locale";
import { CheckCircle2, Clock, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface CommentAuthor {
  id: number;
  firstName: string;
  lastName: string;
  photo: string | null;
}

export interface CommentAssignee {
  id: string;
  userId: number;
  user: { id: number; firstName: string; lastName: string };
  status: "PENDING" | "SEEN" | "DONE";
  seenAt: string | null;
  doneAt: string | null;
}

export interface CommentData {
  id: string;
  entityType: string;
  entityId: string;
  content: string;
  isTask: boolean;
  isSystem?: boolean;
  author: CommentAuthor;
  assignees: CommentAssignee[];
  createdAt: string;
  _pending?: boolean;
  _failed?: boolean;
}

export function CommentSkeleton() {
  return (
    <div className="py-3">
      <div className="flex gap-3">
        <Skeleton className="size-7 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}

export function RelativeTime({ date }: { date: string }) {
  const d = new Date(date);
  const now = new Date();
  const diffHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);

  if (diffHours < 24) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-[11px] text-muted-foreground/70 cursor-default">
            {formatDistanceToNow(d, { addSuffix: true, locale: uz })}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {format(d, "dd.MM.yyyy, HH:mm:ss")}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span className="text-[11px] text-muted-foreground/70">
      {format(d, "dd.MM.yyyy, HH:mm")}
    </span>
  );
}

export function AssigneeChip({ assignee }: { assignee: CommentAssignee }) {
  const statusConfig = {
    PENDING: {
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
      label: "Kutilmoqda",
    },
    SEEN: {
      icon: Eye,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
      label: "Ko'rdi",
    },
    DONE: {
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
      label: "Bajardi",
    },
  };

  const config = statusConfig[assignee.status];
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${config.bg} ${config.color}`}
        >
          <Icon className="size-3" />
          {assignee.user.firstName} {assignee.user.lastName}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {config.label}
        {assignee.doneAt &&
          ` — ${format(new Date(assignee.doneAt), "dd.MM.yyyy, HH:mm")}`}
        {!assignee.doneAt &&
          assignee.seenAt &&
          ` — ${format(new Date(assignee.seenAt), "dd.MM.yyyy, HH:mm")}`}
      </TooltipContent>
    </Tooltip>
  );
}

export function SendStatus({
  pending,
  failed,
}: {
  pending?: boolean;
  failed?: boolean;
}) {
  if (failed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-destructive text-[10px] font-bold">!</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Yuborilmadi
        </TooltipContent>
      </Tooltip>
    );
  }
  if (pending) {
    return <Clock className="size-3 text-muted-foreground/50 animate-pulse" />;
  }
  return null;
}
