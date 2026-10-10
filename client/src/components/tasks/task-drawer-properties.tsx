"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import toast from "react-hot-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import type { TaskAccess, TaskDetail, TaskPerson, TaskPriority } from "@/hooks/use-tasks";
import { tashkentDateTime } from "./task-create-dialog";
import { TaskAssigneePicker } from "./task-assignee-picker";
import { DueBadge } from "./task-card";
import { tashkentDayAndTime } from "./task-due";
import { personName } from "./task-feed-text";
import { taskEntityHref } from "./task-href";
import { ENTITY_LABEL, PRIORITY_CLASS, PRIORITY_LABEL, isOpenStatus } from "./task-labels";
import { useTaskWrite } from "./use-task-write";

const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const DEFAULT_TIME = "18:00";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-start gap-x-3">
      <dt className="pt-0.5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function PersonChip({ p, unseen }: { p: TaskPerson; unseen?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar size="sm">
        {p.photo && <AvatarImage src={p.photo} alt={p.firstName} />}
        <AvatarFallback className="text-[9px]">{p.firstName.charAt(0)}{p.lastName.charAt(0)}</AvatarFallback>
      </Avatar>
      {personName(p)}
      {unseen && <span className="text-[11px] text-amber-700 dark:text-amber-400">hali ko&apos;rmadi</span>}
    </span>
  );
}

/** Assignees or watchers; whoever may change them picks from the same list as the create dialog. */
function PeopleRow({ task, mode, canEdit, showSeen }: { task: TaskDetail; mode: "assignees" | "watchers"; canEdit: boolean; showSeen: boolean }) {
  const { busy, run } = useTaskWrite();
  const [draft, setDraft] = useState<number[] | null>(null);
  const people = mode === "assignees" ? task.assignees : task.watchers;

  if (draft !== null) {
    const save = async () => {
      // The endpoint takes both lists; the one that is not being edited goes back unchanged.
      const other = (mode === "assignees" ? task.watchers : task.assignees).map((p) => p.id);
      const body = mode === "assignees" ? { assigneeIds: draft, watcherIds: other } : { assigneeIds: other, watcherIds: draft };
      if (await run(api.put(`/tasks/${task.id}/participants`, body), "Ro'yxatni saqlashda xatolik yuz berdi")) {
        toast.success(mode === "assignees" ? "Ijrochilar yangilandi" : "Kuzatuvchilar yangilandi");
        setDraft(null);
      }
    };
    return (
      <div className="space-y-2">
        <TaskAssigneePicker value={draft} onChange={setDraft} mode={mode} placeholder="Ism yozing" />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || (mode === "assignees" && draft.length === 0)} onClick={() => void save()}>Saqlash</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>Bekor qilish</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {people.length === 0 && <span className="text-muted-foreground">—</span>}
      {people.map((p) => <PersonChip key={p.id} p={p} unseen={showSeen && p.seenAt === null} />)}
      {canEdit && <Button variant="ghost" size="xs" onClick={() => setDraft(people.map((p) => p.id))}>O&apos;zgartirish</Button>}
    </div>
  );
}

function DueRow({ task, canEdit }: { task: TaskDetail; canEdit: boolean }) {
  const { busy, run } = useTaskWrite();
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState<Date | undefined>();
  const [time, setTime] = useState(DEFAULT_TIME);

  const start = () => {
    const cur = task.dueAt ? tashkentDayAndTime(task.dueAt) : null;
    setDay(cur?.day);
    setTime(cur?.time ?? DEFAULT_TIME);
    setEditing(true);
  };
  const save = async (dueAt: string | null) => {
    if (await run(api.patch(`/tasks/${task.id}`, { dueAt }))) setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <DatePicker value={day} onChange={setDay} disabledDaysOfWeek={[0]} placeholder="Sana" className="flex-1" />
          <TimePicker value={time} onChange={setTime} minTime="08:00" maxTime="22:00" className="w-28" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || !day} onClick={() => day && void save(tashkentDateTime(day, time))}>Saqlash</Button>
          {task.dueAt && <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(null)}>Olib tashlash</Button>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Bekor qilish</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {task.dueAt ? <DueBadge dueAt={task.dueAt} closedAt={task.closedAt} /> : <span className="text-muted-foreground">—</span>}
      {canEdit && <Button variant="ghost" size="xs" onClick={start}>{task.dueAt ? "O'zgartirish" : "Muddat qo'yish"}</Button>}
    </div>
  );
}

function PriorityRow({ task, canEdit }: { task: TaskDetail; canEdit: boolean }) {
  const { busy, run } = useTaskWrite();
  if (!canEdit) {
    return <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", PRIORITY_CLASS[task.priority])}>{PRIORITY_LABEL[task.priority]}</span>;
  }
  return (
    <div role="group" aria-label="Muhimlik" className="inline-flex rounded-md border">
      {PRIORITIES.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={task.priority === p}
          disabled={busy}
          onClick={() => { if (p !== task.priority) void run(api.patch(`/tasks/${task.id}`, { priority: p })); }}
          className={cn("px-2.5 py-1 text-xs", task.priority === p ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted/50")}
        >
          {PRIORITY_LABEL[p]}
        </button>
      ))}
    </div>
  );
}

function EntityLink({ type, id }: { type: string; id: string }) {
  const can = usePermissions((s) => s.can);
  const href = taskEntityHref(type, id, can);
  const label = ENTITY_LABEL[type] ?? type;
  // A viewer without the page gets the name of the thing, not a link that ends in a 403.
  if (!href) return <span className="inline-flex items-center gap-1"><Link2 className="size-3.5" />{label}</span>;
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-primary hover:underline">
      <Link2 className="size-3.5" />{label} sahifasiga o&apos;tish
    </Link>
  );
}

export function TaskDrawerProperties({ task, access }: { task: TaskDetail; access: TaskAccess }) {
  // The server edits manual, open tasks only, and only for the author or a manager.
  const canEdit = access.canManage && task.kind === "MANUAL" && isOpenStatus(task.status);
  return (
    <dl className="space-y-2.5 text-sm">
      <Row label="Beruvchi">{task.author ? <PersonChip p={task.author} /> : <span className="text-muted-foreground">Tizim</span>}</Row>
      <Row label={task.assignees.length > 1 ? "Ijrochilar" : "Ijrochi"}>
        <PeopleRow task={task} mode="assignees" canEdit={canEdit} showSeen={access.canManage && isOpenStatus(task.status)} />
      </Row>
      {(task.watchers.length > 0 || canEdit) && (
        <Row label="Kuzatuvchi"><PeopleRow task={task} mode="watchers" canEdit={canEdit} showSeen={false} /></Row>
      )}
      <Row label="Muddat"><DueRow task={task} canEdit={canEdit} /></Row>
      <Row label="Muhimlik"><PriorityRow task={task} canEdit={canEdit} /></Row>
      {task.entityType && task.entityId && <Row label="Bog'liq"><EntityLink type={task.entityType} id={task.entityId} /></Row>}
      {task.returnedCount > 0 && <Row label="Qaytarilgan"><span className="text-amber-700 dark:text-amber-400">{task.returnedCount} marta</span></Row>}
    </dl>
  );
}
