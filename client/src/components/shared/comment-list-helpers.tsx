"use client";

import { format, formatDistanceToNow } from "date-fns";
import { uz } from "date-fns/locale";
import { Clock } from "lucide-react";
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

export interface CommentData {
  id: string;
  entityType: string;
  entityId: string;
  content: string;
  isSystem?: boolean;
  /** Null for a system task (shown as «Tizim»). */
  author: CommentAuthor | null;
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
