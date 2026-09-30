"use client";

import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import { format, parseISO, isToday, isPast } from "date-fns";
import {
  CalendarClock,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  User,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import type { TaskItem, TaskPriority } from "@/hooks/use-tasks-board";
import { useTasksBoard } from "@/hooks/use-tasks-board";
import { cn } from "@/lib/utils";
import { UnmarkedLessonPrompt } from "@/components/attendance/unmarked/unmarked-lesson-prompt";
import { taskEntityHref } from "./task-entity-href";

const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; className: string }
> = {
  URGENT: {
    label: "Shoshilinch",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  HIGH: {
    label: "Yuqori",
    className:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  },
  MEDIUM: {
    label: "O'rtacha",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  LOW: {
    label: "Past",
    className:
      "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400",
  },
};

const ENTITY_LABEL_MAP: Record<string, string> = {
  Student: "Talaba",
  User: "Xodim",
  Group: "Guruh",
  Lead: "Lid",
};

interface TaskCardProps {
  task: TaskItem;
  isOverlay?: boolean;
  isDragDisabled: boolean;
}

export function TaskCard({ task, isOverlay, isDragDisabled }: TaskCardProps) {
  const router = useRouter();
  const tab = useTasksBoard((s) => s.tab);
  const user = useAuth((s) => s.user);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: task.id,
    disabled: isDragDisabled,
  });

  const style =
    isOverlay || !transform
      ? undefined
      : {
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
          opacity: isDragging ? 0.5 : 1,
        };

  const authorInitials = task.author
    ? task.author.firstName.charAt(0) + task.author.lastName.charAt(0)
    : "";

  const entityLabel = ENTITY_LABEL_MAP[task.entityType] ?? task.entityType;
  const entityUrl = taskEntityHref(
    task.entityType,
    task.entityId,
    user?.roles.map((r) => r.id) ?? [],
  );

  function handleClick() {
    if (entityUrl) {
      router.push(entityUrl);
    }
  }

  function renderDeadlineBadge() {
    if (!task.dueDate) return null;

    const date = parseISO(task.dueDate);
    const formatted = format(date, "dd.MM.yyyy");

    let badgeClass =
      "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400";
    let label = formatted;

    if (isToday(date)) {
      badgeClass =
        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      label = `Bugun - ${formatted}`;
    } else if (isPast(date)) {
      badgeClass =
        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      label = `Muddati o'tgan - ${formatted}`;
    }

    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
          badgeClass
        )}
      >
        <CalendarClock className="size-3" />
        {label}
      </div>
    );
  }

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay || isDragDisabled ? {} : { ...listeners, ...attributes })}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm",
        !isDragDisabled && "cursor-grab active:cursor-grabbing",
        isDragDisabled && entityUrl && "cursor-pointer",
        isOverlay && "shadow-lg ring-2 ring-primary/20 rotate-2"
      )}
      onClick={isDragDisabled ? handleClick : undefined}
    >
      <div className="space-y-2">
        {/* Content */}
        <p
          className={cn(
            "text-sm leading-snug line-clamp-3",
            entityUrl && "cursor-pointer hover:text-primary transition-colors"
          )}
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          onPointerDown={(e) => {
            if (!isDragDisabled) e.stopPropagation();
          }}
        >
          {task.content}
        </p>

        {/* Priority + deadline row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {task.priority && (
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                PRIORITY_CONFIG[task.priority].className
              )}
            >
              <AlertTriangle className="size-3" />
              {PRIORITY_CONFIG[task.priority].label}
            </div>
          )}
          {renderDeadlineBadge()}
        </div>

        {/* Entity link */}
        {entityUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick();
                }}
                onPointerDown={(e) => {
                  if (!isDragDisabled) e.stopPropagation();
                }}
              >
                <ArrowUpRight className="size-3" />
                {entityLabel} sahifasiga o&apos;tish
              </button>
            </TooltipTrigger>
            <TooltipContent>{entityLabel} sahifasini ochish</TooltipContent>
          </Tooltip>
        )}

        {task.unmarkedLesson?.status === "PENDING" && (
          // Stop the card's drag and click from firing inside the prompt and
          // its dialogs (React events bubble through portals).
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <UnmarkedLessonPrompt
              lesson={{
                groupId: task.unmarkedLesson.groupId,
                groupName: task.unmarkedLesson.groupName,
                date: task.unmarkedLesson.date,
                startTime: task.unmarkedLesson.lessonStartTime,
                endTime: task.unmarkedLesson.lessonEndTime,
              }}
              info={{
                id: task.unmarkedLesson.id,
                status: task.unmarkedLesson.status,
                teacherPayExempt: task.unmarkedLesson.teacherPayExempt,
                lessonStartTime: task.unmarkedLesson.lessonStartTime,
                lessonEndTime: task.unmarkedLesson.lessonEndTime,
                // A viewer who still has the task holds it or nobody does:
                // the server deletes the other copies when someone takes it.
                claimedBy: null,
              }}
              onAnswered={() => void useTasksBoard.getState().fetchMyTasks()}
              className="w-full"
            />
          </div>
        )}

        {/* Footer: author + assignees */}
        <div className="flex items-center justify-between pt-1 border-t">
          {task.author ? (
            <div className="flex items-center gap-1.5">
              <Avatar className="size-5">
                {task.author.photo && (
                  <AvatarImage src={task.author.photo} alt={task.author.firstName} />
                )}
                <AvatarFallback className="text-[8px]">
                  {authorInitials}
                </AvatarFallback>
              </Avatar>
              <span className="text-[11px] text-muted-foreground truncate max-w-24">
                {task.author.firstName} {task.author.lastName}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="flex size-5 items-center justify-center rounded-full bg-muted">
                <Bot className="size-3 text-muted-foreground" />
              </span>
              <span className="text-[11px] text-muted-foreground">Tizim</span>
            </div>
          )}

          {tab === "created" && task.assignees.length > 0 && (
            <div className="flex items-center -space-x-1">
              {task.assignees.slice(0, 3).map((assignee) => (
                <Tooltip key={assignee.id}>
                  <TooltipTrigger asChild>
                    <Avatar className="size-5 border-2 border-card">
                      <AvatarFallback className="text-[8px]">
                        <User className="size-3" />
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>
                    {assignee.firstName} {assignee.lastName} — {assignee.status === "DONE" ? "Bajarildi" : assignee.status === "SEEN" ? "Ko'rdi" : "Kutilmoqda"}
                  </TooltipContent>
                </Tooltip>
              ))}
              {task.assignees.length > 3 && (
                <Badge
                  variant="secondary"
                  className="h-5 px-1 text-[9px] ml-1"
                >
                  +{task.assignees.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
