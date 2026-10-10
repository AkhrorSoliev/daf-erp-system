"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  BookOpen,
  CalendarClock,
  CalendarX,
  CheckCheck,
  CircleCheck,
  CirclePause,
  CircleX,
  ClipboardList,
  Clock,
  Info,
  ListPlus,
  MessageSquare,
  SquareCheck,
  UserX,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  actionLabel,
  groupHint,
  groupTitle,
  isPending,
  lessonLine,
  lessonParts,
  relativeTime,
  resolvedLine,
  type AppNotification,
  type NotificationGroup,
  type NotificationRow,
  type NotificationType,
} from "./notification-view";

const ICON: Record<NotificationType, LucideIcon> = {
  COMMENT: MessageSquare,
  TASK_ASSIGNED: ListPlus,
  TASK_STATUS_CHANGED: CheckCheck,
  TASK_DELETED: CircleX,
  TASK_UPDATED: MessageSquare,
  TASK_REMINDER: Clock,
  TASK_REVIEW: SquareCheck,
  TASK_OVERDUE: AlarmClock,
  SYSTEM: Info,
  LESSON_STARTED: BookOpen,
  ATTENDANCE_ADMIN_ALERT: Clock,
  ATTENDANCE_TEACHER_WARNING: Clock,
  ATTENDANCE_MISSING_TEACHER: Clock,
  ATTENDANCE_MISSING_ADMIN: Clock,
  ATTENDANCE_COMPLETED: ClipboardList,
  LESSON_RESCHEDULED: CalendarClock,
  LESSON_CANCELLED: CalendarX,
  PAYMENT_PROMISE_OVERDUE: Wallet,
  ABSENCE_WARNING: UserX,
  ENROLLMENT_AUTO_PAUSED: CirclePause,
};

/** One colour per kind (spec §8 «har turning rangi»); a closed alert turns green. */
const TONE: Record<NotificationGroup, string> = {
  task: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  attendance: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  payment: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  system: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
const DONE_TONE = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";

/** The bell's and the page's empty list. */
export function NotificationEmpty({ text }: { text: string }) {
  return (
    <div className="flex h-16 items-center justify-center px-4">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/** The bell's and the page's list whose request failed: never the empty state, a retry instead. */
export function NotificationFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-2 px-4 py-5 text-center">
      <p role="alert" className="text-sm text-muted-foreground">
        {"Ma'lumotni yuklab bo'lmadi"}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Qayta urinish
      </Button>
    </div>
  );
}

/** The bell's and the page's list while the first answer is on its way. */
export function NotificationSkeleton() {
  return (
    <div className="space-y-4 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface RowProps {
  row: NotificationRow;
  now: Date;
  onOpen: (n: AppNotification) => void;
  hrefOf: (n: AppNotification) => string | null;
  /** The page folds a group until «Ko'rish»; the panel shows its sub-rows. */
  collapsible?: boolean;
}

export function NotificationRowView({ row, now, onOpen, hrefOf, collapsible = false }: RowProps) {
  if (row.kind === "single") {
    return <SingleRow n={row.item} now={now} onOpen={onOpen} hrefOf={hrefOf} />;
  }
  return <GroupRow row={row} now={now} onOpen={onOpen} hrefOf={hrefOf} collapsible={collapsible} />;
}

function KindIcon({ n, done }: { n: Pick<AppNotification, "type" | "group">; done: boolean }) {
  const Glyph = done ? CircleCheck : (ICON[n.type] ?? Info);
  return (
    <span
      className={cn(
        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
        done ? DONE_TONE : TONE[n.group],
      )}
    >
      <Glyph className="size-4" />
    </span>
  );
}

function SingleRow({
  n,
  now,
  onOpen,
  hrefOf,
}: {
  n: AppNotification;
  now: Date;
  onOpen: (n: AppNotification) => void;
  hrefOf: (n: AppNotification) => string | null;
}) {
  const done = n.resolvedAt !== null;
  const href = hrefOf(n);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(n)}
      onKeyDown={(e) => {
        // A key pressed on the row's own button belongs to that button.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(n);
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring",
        !n.isRead && !done && "bg-blue-50/50 dark:bg-blue-950/20",
        done && "opacity-60",
      )}
    >
      <KindIcon n={n} done={done} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium leading-tight">{n.title}</p>
        {/* A lesson alert is a block of labelled lines plus the portal link: show its one-line form. */}
        <p className="line-clamp-2 text-xs text-muted-foreground">{n.groupKey ? lessonLine(n) : n.message}</p>
        <p className="text-xs text-muted-foreground">
          {n.resolvedAt ? resolvedLine(n.resolvedAt) : relativeTime(n.createdAt, now)}
        </p>
      </div>
      {isPending(n) && href ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(n);
          }}
        >
          {actionLabel(n.type)}
        </Button>
      ) : !n.isRead && !done ? (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-blue-500" />
      ) : null}
    </div>
  );
}

function GroupRow({
  row,
  now,
  onOpen,
  hrefOf,
  collapsible,
}: {
  row: Extract<NotificationRow, { kind: "group" }>;
  now: Date;
  onOpen: (n: AppNotification) => void;
  hrefOf: (n: AppNotification) => string | null;
  collapsible: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  const first = row.items[0];
  const done = row.items.every((n) => n.resolvedAt !== null);
  const names = row.items.map((n) => lessonParts(n.message).group ?? n.title).join(", ");
  return (
    <div className={cn("flex items-start gap-3 px-4 py-2.5", done && "opacity-60")}>
      <KindIcon n={first} done={done} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium leading-tight">{groupTitle(row)}</p>
        <p className="text-xs text-muted-foreground">
          {collapsible && !open && !done ? `${names} · ${relativeTime(first.createdAt, now)}` : groupHint(row)}
        </p>
        {open && (
          <div className="space-y-1 pt-1">
            {row.items.map((n) => {
              const href = hrefOf(n);
              const line = `${lessonLine(n)}${n.resolvedAt !== null ? " · yopildi" : ""}`;
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs",
                    n.resolvedAt !== null && "text-muted-foreground",
                  )}
                >
                  {/* One line: a long teacher name is cut, it does not wrap the row. */}
                  <span className="min-w-0 flex-1 truncate" title={line}>
                    {line}
                  </span>
                  {isPending(n) && href ? (
                    <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs" onClick={() => onOpen(n)}>
                      Ochish
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {collapsible ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 text-xs"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Yopish" : "Ko'rish"}
        </Button>
      ) : null}
    </div>
  );
}
