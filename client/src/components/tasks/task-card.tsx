"use client";

import { useDraggable } from "@dnd-kit/core";
import { Bot, CalendarClock, Camera, CheckSquare, Eye, EyeOff, Link2, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UnmarkedLessonPrompt } from "@/components/attendance/unmarked/unmarked-lesson-prompt";
import { useTasks, type TaskCard as TaskCardData, type TaskPerson } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";
import { ENTITY_LABEL, KIND_LABEL, PRIORITY_CLASS, PRIORITY_LABEL } from "./task-labels";
import { dueState, formatDue } from "./task-due";

const initials = (p: TaskPerson) => `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`;

function Person({ p, className }: { p: TaskPerson; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar className={cn("size-5 border-2 border-card", className)}>
          {p.photo && <AvatarImage src={p.photo} alt={p.firstName} />}
          <AvatarFallback className="text-[8px]">{initials(p)}</AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent>{p.firstName} {p.lastName}{p.seenAt === null ? " — hali ko'rmadi" : ""}</TooltipContent>
    </Tooltip>
  );
}

export function DueBadge({ dueAt, closedAt }: { dueAt: string | null; closedAt: string | null }) {
  if (!dueAt) return null;
  const now = new Date();
  const state = closedAt ? "later" : dueState(dueAt, now);
  const cls = state === "overdue" ? "text-red-700 dark:text-red-400 font-medium" : state === "today" ? "text-amber-700 dark:text-amber-400 font-medium" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]", cls)}>
      <CalendarClock className="size-3" />
      {state === "overdue" ? `Muddati o'tdi · ${formatDue(dueAt, now)}` : formatDue(dueAt, now)}
    </span>
  );
}

interface Props { task: TaskCardData; dragEnabled: boolean; isOverlay?: boolean; showAssignees: boolean }

export function TaskCard({ task, dragEnabled, isOverlay, showAssignees }: Props) {
  const openTask = useTasks((s) => s.openTask);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !dragEnabled });
  const style = isOverlay || !transform ? undefined : { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 };
  const isSystem = task.kind !== "MANUAL";
  const unseen = showAssignees && task.assignees.length > 0 && task.assignees.every((a) => a.seenAt === null);

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      {...(isOverlay || !dragEnabled ? {} : { ...listeners, ...attributes })}
      onClick={() => openTask(task.id)}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) openTask(task.id); }}
      className={cn("rounded-lg border bg-card p-3 shadow-sm cursor-pointer space-y-2", dragEnabled && "active:cursor-grabbing", isOverlay && "shadow-lg ring-2 ring-primary/20 rotate-2", task.status === "DONE" && "opacity-80")}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {isSystem && <span className="inline-flex items-center gap-1 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background"><Bot className="size-3" />Tizim</span>}
        {isSystem && KIND_LABEL[task.kind] && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{KIND_LABEL[task.kind]}</span>}
        {task.priority !== "MEDIUM" && <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", PRIORITY_CLASS[task.priority])}>{PRIORITY_LABEL[task.priority]}</span>}
        {task.requiresPhoto && <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"><Camera className="size-3" />Rasm bilan</span>}
        {task.batch && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Har biriga alohida · {task.batch.total}</span>}
      </div>
      <p className={cn("text-sm leading-snug line-clamp-3", task.status === "DONE" && "text-muted-foreground")}>{task.title}</p>
      {task.unmarkedLesson?.branchName && <p className="text-[11px] text-muted-foreground">{task.unmarkedLesson.branchName}</p>}
      {task.batch && (
        <div className="space-y-1">
          <div className="h-1.5 rounded bg-muted"><div className="h-full rounded bg-emerald-500" style={{ width: `${(100 * task.batch.done) / task.batch.total}%` }} /></div>
          <p className="text-[11px] text-muted-foreground">{task.batch.done}/{task.batch.total} bajardi</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {task.stepsTotal > 0 && <span className="inline-flex items-center gap-1"><CheckSquare className="size-3" />{task.stepsDone}/{task.stepsTotal}</span>}
        {task.eventsCount > 1 && <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" />{task.eventsCount - 1}</span>}
        {task.entityType && <span className="inline-flex items-center gap-1"><Link2 className="size-3" />{ENTITY_LABEL[task.entityType] ?? task.entityType}</span>}
        <DueBadge dueAt={task.dueAt} closedAt={task.closedAt} />
      </div>
      {task.unmarkedLesson?.status === "PENDING" && (
        // Keep the card's drag and click out of the prompt and its dialogs
        // (React events bubble through portals).
        <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <UnmarkedLessonPrompt
            lesson={{ groupId: task.unmarkedLesson.groupId, groupName: task.unmarkedLesson.groupName, date: task.unmarkedLesson.date, startTime: task.unmarkedLesson.lessonStartTime, endTime: task.unmarkedLesson.lessonEndTime }}
            info={{
              id: task.unmarkedLesson.id, status: task.unmarkedLesson.status, teacherPayExempt: task.unmarkedLesson.teacherPayExempt,
              lessonStartTime: task.unmarkedLesson.lessonStartTime, lessonEndTime: task.unmarkedLesson.lessonEndTime,
              // A viewer who still has the task holds it or nobody does: the
              // server deletes the other copies when someone takes it.
              claimedBy: null,
            }}
            onAnswered={() => void useTasks.getState().refreshTask(task.id)}
            className="w-full"
          />
        </div>
      )}
      <div className="flex items-center justify-between border-t pt-1.5">
        {task.author ? <span className="truncate text-[11px] text-muted-foreground max-w-32">{task.author.firstName} {task.author.lastName}</span> : <span className="text-[11px] text-muted-foreground">Tizim</span>}
        {showAssignees ? (
          <div className="flex items-center gap-1">
            {unseen ? <EyeOff className="size-3 text-amber-600" /> : <Eye className="size-3 text-muted-foreground" />}
            <div className="flex -space-x-1">{task.assignees.slice(0, 4).map((a) => <Person key={a.id} p={a} />)}</div>
          </div>
        ) : (
          <div className="flex -space-x-1">{task.assignees.slice(0, 3).map((a) => <Person key={a.id} p={a} />)}</div>
        )}
      </div>
    </div>
  );
}
