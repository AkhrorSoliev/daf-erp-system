"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import type { TaskAccess, TaskDetail } from "@/hooks/use-tasks";
import { EditableText } from "./task-drawer-editable";
import { isOpenStatus } from "./task-labels";
import { useTaskWrite } from "./use-task-write";

export function TaskDrawerSteps({ task, access }: { task: TaskDetail; access: TaskAccess }) {
  const { busy, run } = useTaskWrite();
  const [draft, setDraft] = useState<string | null>(null);
  // The server keeps steps to manual tasks that are still open.
  const editable = task.kind === "MANUAL" && isOpenStatus(task.status);
  const canWork = editable && access.canWork;
  const canManage = editable && access.canManage;
  const done = task.steps.filter((s) => s.doneAt).length;
  const total = task.steps.length;
  if (total === 0 && !canWork) return null;

  const base = `/tasks/${task.id}/steps`;
  const add = async () => {
    const title = (draft ?? "").trim();
    if (!title || busy) return;
    // The field stays open for the next step (Escape closes it), and keeps what
    // was typed when the request fails. Typing on while it runs is not wiped.
    if (await run(api.post(base, { title }), "Qadam qo'shishda xatolik yuz berdi")) setDraft((cur) => (cur === draft ? "" : cur));
  };

  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        Kichik qadamlar {total > 0 && <span className="font-normal text-muted-foreground">{done}/{total}</span>}
      </h4>
      {total > 0 && (
        <div className="h-1.5 rounded bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Bajarilgan qadamlar">
          <div className="h-full rounded bg-emerald-500" style={{ width: `${(100 * done) / total}%` }} />
        </div>
      )}
      <ul className="space-y-1.5">
        {task.steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={!!s.doneAt}
              disabled={!canWork || busy}
              aria-label={s.title}
              onCheckedChange={(v) => void run(api.patch(`${base}/${s.id}`, { done: v === true }))}
            />
            <div className={s.doneAt ? "min-w-0 flex-1 break-words text-muted-foreground line-through" : "min-w-0 flex-1 break-words"}>
              <EditableText
                value={s.title}
                canEdit={canManage && !busy}
                placeholder="Qadam nomi"
                maxLength={200}
                className="text-sm"
                onSave={(title) => void run(api.patch(`${base}/${s.id}`, { title }), "Qadam nomini saqlashda xatolik yuz berdi")}
              />
            </div>
            {canManage && (
              <Button variant="ghost" size="icon-xs" aria-label="Qadamni o'chirish" disabled={busy} onClick={() => void run(api.delete(`${base}/${s.id}`), "Qadamni o'chirishda xatolik yuz berdi")}>
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canWork && (draft === null ? (
        <Button variant="ghost" size="sm" onClick={() => setDraft("")}><Plus className="mr-1 size-3" />Qadam qo&apos;shish</Button>
      ) : (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={200}
            className="h-8"
            placeholder="Qadam nomi"
          />
          <Button type="submit" size="sm" className="h-8" disabled={busy || !draft.trim()}>Qo&apos;shish</Button>
        </form>
      ))}
    </section>
  );
}
