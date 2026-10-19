"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskRecurrenceView } from "@/hooks/use-tasks";
import { useT } from "@/i18n/context";
import { changes, dayMonth, formFromRule, recurrenceFormReady, recurrenceLine, type RecurrenceForm } from "@/lib/task-recurrence-rules";
import { TaskAssigneePicker } from "./task-assignee-picker";
import { TaskRecurrenceFields } from "./task-recurrence-fields";

/** A recurring task's rule (spec §3.6): the author, a director of its branch or the CEO edits, stops or resumes it. */
export function TaskDrawerRecurrence({ taskId, rule }: { taskId: string; rule: TaskRecurrenceView }) {
  const t = useT();
  const [draft, setDraft] = useState<{ form: RecurrenceForm; assigneeIds: number[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await api.patch(`/tasks/recurrences/${rule.id}`, body);
      toast.success(done);
      setDraft(null);
      void useTasks.getState().reloadDetail(taskId);
      // Every card of the rule carries its badge.
      void useTasks.getState().fetchBoard();
    } catch (error) {
      toast.error(getErrorMessage(error, t("Takrorlanishni saqlashda xatolik yuz berdi")));
    } finally {
      setBusy(false);
    }
  };

  const body = draft ? changes(rule, draft.form, draft.assigneeIds) : {};
  const saveable = draft !== null && draft.assigneeIds.length > 0 && recurrenceFormReady(draft.form) && Object.keys(body).length > 0;

  return (
    <section className="space-y-1.5">
      <h4 className="text-sm font-semibold">{t("Takrorlanish")}</h4>
      {draft ? (
        <div className="space-y-3">
          <TaskRecurrenceFields value={draft.form} onChange={(form) => setDraft({ ...draft, form })} allowNone={false} />
          <div className="space-y-1.5">
            <Label>{t("Keyingi topshiriqlar ijrochisi")}</Label>
            <TaskAssigneePicker value={draft.assigneeIds} onChange={(assigneeIds) => setDraft({ ...draft, assigneeIds })} mode="assignees" placeholder={t("Ism yozing")} />
          </div>
          <p className="text-xs text-muted-foreground">{t("O'zgarish ertadan boshlab ishlaydi.")}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !saveable} onClick={() => void send(body, t("Takrorlanish yangilandi"))}>{t("Saqlash")}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>{t("Bekor qilish")}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={rule.active ? undefined : "text-muted-foreground line-through"}>{recurrenceLine(rule, t)}</span>
          <span className="text-xs text-muted-foreground">{rule.active ? t("Keyingisi: {date}", { date: dayMonth(rule.nextRunDate) }) : t("Takrorlanish to'xtatilgan")}</span>
          {rule.canManage && rule.active && (
            <Button size="xs" variant="ghost" onClick={() => setDraft({ form: formFromRule(rule), assigneeIds: rule.assignees.map((a) => a.id) })}>{t("O'zgartirish")}</Button>
          )}
          {rule.canManage && (
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => void send({ active: !rule.active }, rule.active ? t("Takrorlanish to'xtatildi") : t("Takrorlanish qayta yoqildi"))}>
              {rule.active ? t("To'xtatish") : t("Davom ettirish")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
