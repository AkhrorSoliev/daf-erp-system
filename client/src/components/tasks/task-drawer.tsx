"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { UnmarkedLessonPrompt } from "@/components/attendance/unmarked/unmarked-lesson-prompt";
import api from "@/lib/api";
import { useTasks, type TaskDetailPayload } from "@/hooks/use-tasks";
import { TaskDrawerBatch } from "./task-drawer-batch";
import { EditableText } from "./task-drawer-editable";
import { TaskDrawerFeed } from "./task-drawer-feed";
import { TaskDrawerFooter } from "./task-drawer-footer";
import { TaskDrawerMenu } from "./task-drawer-menu";
import { TaskDrawerProperties } from "./task-drawer-properties";
import { TaskDrawerSteps } from "./task-drawer-steps";
import { JoinRequestPanel } from "./join-request/join-request-panel";
import { isOpenStatus, KIND_LABEL } from "./task-labels";
import { TaskStatusPill } from "./task-status-pill";
import { useTaskWrite } from "./use-task-write";

// One drawer shows the open task. The first instance to mount wins; a second
// one (the entity panel mounts its own) renders nothing, so two sheets never
// open on the same `openTaskId`; when the owner unmounts, a waiting one takes
// over. The owner lives outside React, and instances read it through
// useSyncExternalStore, which is how a mount effect can change what the first
// render drew without setting state inside the effect.
let owner: symbol | null = null;
const watchers = new Set<() => void>();
const notify = () => watchers.forEach((fn) => fn());
const subscribe = (fn: () => void) => { watchers.add(fn); return () => void watchers.delete(fn); };

function useOwnsDrawer(): boolean {
  const [me] = useState(() => Symbol("task-drawer"));
  useEffect(() => {
    // Runs on mount and whenever any instance lets go; only a free slot is taken.
    const claim = () => {
      if (owner !== null) return;
      owner = me;
      notify();
    };
    watchers.add(claim);
    claim();
    return () => {
      watchers.delete(claim);
      if (owner !== me) return;
      owner = null;
      // Leaving the page must not leave a task «open» for the next visit.
      useTasks.getState().openTask(null);
      notify();
    };
  }, [me]);
  return useSyncExternalStore(subscribe, () => owner === me, () => false);
}

function DrawerBody({ detail, onClose }: { detail: TaskDetailPayload; onClose: () => void }) {
  const { task, events, access, batch } = detail;
  const { run } = useTaskWrite();
  const system = task.kind !== "MANUAL";
  // The server edits manual, open tasks only, and only for the author or a manager.
  const canEdit = access.canManage && !system && isOpenStatus(task.status);
  const lesson = task.unmarkedLesson;
  const patch = (body: Record<string, unknown>) => void run(api.patch(`/tasks/${task.id}`, body));

  return (
    <>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <TaskStatusPill status={task.status} />
        {system && (
          <span className="inline-flex items-center gap-1 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background"><Bot className="size-3" />Tizim</span>
        )}
        {system && KIND_LABEL[task.kind] && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{KIND_LABEL[task.kind]}</span>}
        <div className="ml-auto flex items-center gap-1">
          <TaskDrawerMenu task={task} access={access} />
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X className="size-4" /><span className="sr-only">Yopish</span></Button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
        <SheetTitle asChild>
          <h2 className="text-lg leading-snug font-semibold">
            <EditableText value={task.title} canEdit={canEdit} placeholder="Sarlavha" maxLength={200} onSave={(title) => patch({ title })} />
          </h2>
        </SheetTitle>
        {system && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Bu topshiriqni tizim berdi. Sababi hal bo&apos;lgach, u o&apos;zi yopiladi.
          </p>
        )}
        {lesson?.status === "PENDING" && (
          <UnmarkedLessonPrompt
            lesson={{ groupId: lesson.groupId, groupName: lesson.groupName, date: lesson.date, startTime: lesson.lessonStartTime, endTime: lesson.lessonEndTime }}
            info={{
              id: lesson.id, status: lesson.status, teacherPayExempt: lesson.teacherPayExempt,
              lessonStartTime: lesson.lessonStartTime, lessonEndTime: lesson.lessonEndTime,
              // A viewer who still has the task holds it or nobody does: the
              // server deletes the other copies when someone takes it.
              claimedBy: null,
            }}
            onAnswered={() => void useTasks.getState().reloadDetail(task.id)}
            className="w-full"
          />
        )}
        {task.kind === "JOIN_REQUEST" && (
          <JoinRequestPanel taskId={task.id} onDecided={() => void useTasks.getState().reloadDetail(task.id)} />
        )}
        <TaskDrawerProperties task={task} access={access} />
        {(task.description || canEdit) && (
          <section className="space-y-1.5">
            <h4 className="text-sm font-semibold">Tavsif</h4>
            <EditableText
              value={task.description ?? ""}
              canEdit={canEdit}
              multiline
              placeholder="Tavsif qo'shish"
              maxLength={5000}
              className="text-sm"
              onSave={(description) => patch({ description })}
            />
          </section>
        )}
        <TaskDrawerBatch copies={batch} currentId={task.id} />
        <TaskDrawerSteps task={task} access={access} />
        <TaskDrawerFeed taskId={task.id} events={events} />
      </div>

      <TaskDrawerFooter task={task} access={access} />
    </>
  );
}

function DrawerSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <>
      <SheetTitle className="sr-only">Topshiriq</SheetTitle>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={onClose}><X className="size-4" /><span className="sr-only">Yopish</span></Button>
      </div>
      <div className="space-y-4 px-4 py-4">
        <Skeleton className="h-6 w-3/4" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
        <Skeleton className="h-20 w-full" />
      </div>
    </>
  );
}

/** `onClose` is for what the page does besides closing the drawer (the tasks page drops `?task=`). */
export function TaskDrawer({ onClose }: { onClose?: () => void }) {
  const openTaskId = useTasks((s) => s.openTaskId);
  const detail = useTasks((s) => s.detail);
  const openTask = useTasks((s) => s.openTask);
  const owns = useOwnsDrawer();
  if (!owns) return null;

  const close = () => { openTask(null); onClose?.(); };
  return (
    <Sheet open={openTaskId !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        // Escape in an EditableText field ends that edit, not the whole drawer;
        // anywhere else (the composer, the add-step field) it closes the drawer.
        onEscapeKeyDown={(e) => { if (e.target instanceof Element && e.target.closest("[data-editable]")) e.preventDefault(); }}
      >
        {detail && (openTaskId === null || detail.task.id === openTaskId)
          ?<DrawerBody key={detail.task.id} detail={detail} onClose={close} />
          : <DrawerSkeleton onClose={close} />}
      </SheetContent>
    </Sheet>
  );
}
