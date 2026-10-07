"use client";
import { useState } from "react";
import { create } from "zustand";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp, Loader2, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskPriority } from "@/hooks/use-tasks";
import { TaskAssigneePicker } from "./task-assignee-picker";
import { PRIORITY_LABEL } from "./task-labels";

export interface TaskCreateContext { entityType?: string; entityId?: string; entityLabel?: string }
interface CreateState { isOpen: boolean; context: TaskCreateContext; open: (ctx: TaskCreateContext) => void; close: () => void }
export const useTaskCreate = create<CreateState>((set) => ({
  isOpen: false,
  context: {},
  open: (context) => set({ isOpen: true, context }),
  close: () => set({ isOpen: false }),
}));

const DEFAULT_TIME = "18:00";

/** ISO instant for a picked day + "HH:mm" in Tashkent (UTC+5, no DST). The picker returns local midnight; an empty time means 18:00. */
export function tashkentDateTime(day: Date, time: string): string {
  const [h, m] = (time || DEFAULT_TIME).split(":").map(Number);
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), h - 5, m)).toISOString();
}

const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

/** Mounted once, by `HeaderTaskButton`, so every dashboard page can open it through `useTaskCreate`. */
export function TaskCreateDialog() {
  const { isOpen, context, close } = useTaskCreate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [watcherIds, setWatcherIds] = useState<number[]>([]);
  const [day, setDay] = useState<Date | undefined>();
  const [time, setTime] = useState(DEFAULT_TIME);
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [separate, setSeparate] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim() !== "" && assigneeIds.length > 0 && !saving;
  const reset = () => {
    setTitle(""); setDescription(""); setAssigneeIds([]); setWatcherIds([]); setDay(undefined); setTime(DEFAULT_TIME);
    setPriority("MEDIUM"); setSeparate(false); setSteps([]); setMore(false);
  };
  // A request in flight cannot be walked away from: the dialog stays until it answers.
  const dismiss = () => { if (!saving) { reset(); close(); } };
  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await api.post("/tasks", {
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeIds,
        watcherIds: watcherIds.length ? watcherIds : undefined,
        dueAt: day ? tashkentDateTime(day, time) : undefined,
        priority,
        entityType: context.entityType,
        entityId: context.entityId,
        separateCopies: separate && assigneeIds.length > 1 ? true : undefined,
        steps: steps.filter((s) => s.trim()).map((s) => ({ title: s.trim() })),
      });
      toast.success("Topshiriq berildi");
      reset();
      close();
      // Refetching the board also bumps the store's `version`, which the sidebar counts follow.
      void useTasks.getState().fetchBoard();
    } catch (err) {
      toast.error(getErrorMessage(err, "Topshiriq berishda xatolik"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4"><DialogTitle>Yangi topshiriq</DialogTitle></DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <Input
            autoFocus
            placeholder="Nima qilish kerak?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="h-11 text-base"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
          />
          <div className="space-y-1.5">
            <Label>Ijrochi</Label>
            <TaskAssigneePicker value={assigneeIds} onChange={setAssigneeIds} mode="assignees" placeholder="Ism yozing" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Muddat</Label>
              <div className="flex gap-2">
                <DatePicker value={day} onChange={setDay} disabledDaysOfWeek={[0]} placeholder="Sana" className="flex-1" />
                <TimePicker value={time} onChange={setTime} minTime="08:00" maxTime="22:00" className="w-28" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Muhimlik</Label>
              <div role="radiogroup" aria-label="Muhimlik" className="flex rounded-md border">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={priority === p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 px-2 py-1.5 text-xs ${priority === p ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground"}`}
                  >
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {context.entityLabel && <p className="text-xs text-muted-foreground">Bog&apos;liq: <span className="font-medium text-foreground">{context.entityLabel}</span></p>}
          {assigneeIds.length > 1 && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={separate} onCheckedChange={(v) => setSeparate(v === true)} className="mt-0.5" />
              <span>
                Har biriga alohida
                <span className="block text-xs text-muted-foreground">Har bir ijrochiga o&apos;z nusxasi yaratiladi va holati alohida yuradi</span>
              </span>
            </label>
          )}
          {more && (
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-1.5">
                <Label>Tavsif</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} />
              </div>
              <div className="space-y-1.5">
                <Label>Kichik qadamlar</Label>
                {steps.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={s} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))} maxLength={200} />
                    <Button type="button" variant="ghost" size="icon" aria-label="Qadamni olib tashlash" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => setSteps([...steps, ""])}>
                  <Plus className="mr-1 size-3" />Qadam qo&apos;shish
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label>Kuzatuvchi</Label>
                <TaskAssigneePicker value={watcherIds} onChange={setWatcherIds} mode="watchers" placeholder="Ixtiyoriy" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-row flex-wrap items-center justify-between border-t px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => setMore(!more)}>
            {more ? <>Qisqa ko&apos;rinish<ChevronUp className="ml-1 size-4" /></> : <>Batafsil<ChevronDown className="ml-1 size-4" /></>}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={dismiss} disabled={saving}>Bekor qilish</Button>
            <Button type="button" onClick={() => void submit()} disabled={!canSubmit}>
              {saving && <Loader2 className="mr-1 size-4 animate-spin" />}Berish
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
