"use client";
import { useEffect, useState } from "react";
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
import { useT } from "@/i18n/context";
import { TaskAssigneePicker } from "./task-assignee-picker";
import { priorityText } from "./task-labels";
import { TaskRecurrenceFields } from "./task-recurrence-fields";
import { useTaskFiles } from "./use-task-files";
import { EMPTY_RECURRENCE, recurrenceFormReady, recurrencePayload, type RecurrenceForm } from "@/lib/task-recurrence-rules";

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
  const t = useT();
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
  const [recurrence, setRecurrence] = useState<RecurrenceForm>(EMPTY_RECURRENCE);
  const recurring = recurrence.freq !== "NONE";
  const [requiresPhoto, setRequiresPhoto] = useState(false);
  const filesOn = useTaskFiles((s) => s.enabled === true);
  // The photo option shows only when files are on, so the config is asked for when the dialog opens.
  useEffect(() => { if (isOpen) void useTaskFiles.getState().loadConfig(); }, [isOpen]);

  const canSubmit = title.trim() !== "" && assigneeIds.length > 0 && recurrenceFormReady(recurrence) && !saving;
  const reset = () => {
    setTitle(""); setDescription(""); setAssigneeIds([]); setWatcherIds([]); setDay(undefined); setTime(DEFAULT_TIME);
    setPriority("MEDIUM"); setSeparate(false); setSteps([]); setMore(false); setRequiresPhoto(false);
    setRecurrence(EMPTY_RECURRENCE);
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
        dueAt: !recurring && day ? tashkentDateTime(day, time) : undefined,
        recurrence: recurrencePayload(recurrence),
        priority,
        entityType: context.entityType,
        entityId: context.entityId,
        requiresPhoto: requiresPhoto && !recurring ? true : undefined,
        separateCopies: separate && assigneeIds.length > 1 ? true : undefined,
        steps: steps.filter((s) => s.trim()).map((s) => ({ title: s.trim() })),
      });
      toast.success(recurring ? t("Takrorlanuvchi topshiriq berildi") : t("Topshiriq berildi"));
      reset();
      close();
      // Refetching the board also bumps the store's `version`, which the sidebar counts follow.
      void useTasks.getState().fetchBoard();
    } catch (err) {
      toast.error(getErrorMessage(err, t("Topshiriq berishda xatolik")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4"><DialogTitle>{t("Yangi topshiriq")}</DialogTitle></DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <Input
            autoFocus
            placeholder={t("Nima qilish kerak?")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="h-11 text-base"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
          />
          <div className="space-y-1.5">
            <Label>{t("Ijrochi")}</Label>
            <TaskAssigneePicker value={assigneeIds} onChange={setAssigneeIds} mode="assignees" placeholder={t("Ism yozing")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("Muddat")}</Label>
              {recurring ? (
                <p className="py-2 text-sm text-muted-foreground">{t("Muddat «Takrorlanish» bo'yicha qo'yiladi")}</p>
              ) : (
                <div className="flex gap-2">
                  <DatePicker value={day} onChange={setDay} disabledDaysOfWeek={[0]} placeholder={t("Sana")} className="flex-1" />
                  <TimePicker value={time} onChange={setTime} minTime="08:00" maxTime="22:00" className="w-28" />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("Muhimlik")}</Label>
              <div role="radiogroup" aria-label={t("Muhimlik")} className="flex rounded-md border">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={priority === p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 px-2 py-1.5 text-xs ${priority === p ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground"}`}
                  >
                    {priorityText(p, t)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {context.entityLabel && <p className="text-xs text-muted-foreground">{t("Bog'liq:")} <span className="font-medium text-foreground">{context.entityLabel}</span></p>}
          {assigneeIds.length > 1 && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={separate} onCheckedChange={(v) => setSeparate(v === true)} className="mt-0.5" />
              <span>
                {t("Har biriga alohida")}
                <span className="block text-xs text-muted-foreground">{t("Har bir ijrochiga o'z nusxasi yaratiladi va holati alohida yuradi")}</span>
              </span>
            </label>
          )}
          {more && (
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-1.5">
                <Label>{t("Tavsif")}</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("Kichik qadamlar")}</Label>
                {steps.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={s} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))} maxLength={200} />
                    <Button type="button" variant="ghost" size="icon" aria-label={t("Qadamni olib tashlash")} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => setSteps([...steps, ""])}>
                  <Plus className="mr-1 size-3" />{t("Qadam qo'shish")}
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label>{t("Kuzatuvchi")}</Label>
                <TaskAssigneePicker value={watcherIds} onChange={setWatcherIds} mode="watchers" placeholder={t("Ixtiyoriy")} />
              </div>
              {filesOn && !recurring && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={requiresPhoto} onCheckedChange={(v) => setRequiresPhoto(v === true)} className="mt-0.5" />
                  <span>
                    {t("Rasm bilan tasdiqlansin")}
                    <span className="block text-xs text-muted-foreground">{t("Ijrochi tekshiruvga yuborishdan oldin ish rasmini qo'shadi")}</span>
                  </span>
                </label>
              )}
              <div className="space-y-1.5">
                <Label>{t("Takrorlanish")}</Label>
                <TaskRecurrenceFields value={recurrence} onChange={setRecurrence} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-row flex-wrap items-center justify-between border-t px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => setMore(!more)}>
            {more ? <>{t("Qisqa ko'rinish")}<ChevronUp className="ml-1 size-4" /></> : <>{t("Batafsil")}<ChevronDown className="ml-1 size-4" /></>}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={dismiss} disabled={saving}>{t("Bekor qilish")}</Button>
            <Button type="button" onClick={() => void submit()} disabled={!canSubmit}>
              {saving && <Loader2 className="mr-1 size-4 animate-spin" />}{t("Topshiriqni berish")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
