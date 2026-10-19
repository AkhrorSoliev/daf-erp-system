"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Repeat } from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskRecurrenceView } from "@/hooks/use-tasks";
import { useT } from "@/i18n/context";
import { dayMonth, recurrenceLine } from "@/lib/task-recurrence-rules";
import { personName } from "./task-feed-text";

/** «Takrorlanuvchi» next to «Yangi topshiriq»: the rules this person may manage (spec §9.5 `GET /tasks/recurrences`). */
export function TaskRecurrencesButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} aria-label={t("Takrorlanuvchi topshiriqlar")}>
        <Repeat className="size-4 sm:mr-1" /><span className="hidden sm:inline">{t("Takrorlanuvchi")}</span>
      </Button>
      {open && <RecurrencesDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function RecurrencesDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  // The fetch reads t from here: a language switch must not refetch.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  // `null` = loading.
  const [rows, setRows] = useState<TaskRecurrenceView[] | null>(null);
  const [reads, setReads] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TaskRecurrenceView | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<{ data: TaskRecurrenceView[] }>("/tasks/recurrences")
      .then(({ data }) => { if (alive) setRows(data.data); })
      .catch((error) => {
        if (!alive) return;
        const t = tRef.current;
        setRows([]);
        toast.error(getErrorMessage(error, t("Ro'yxatni yuklashda xatolik")));
      });
    return () => { alive = false; };
  }, [reads]);

  const act = async (rule: TaskRecurrenceView, request: Promise<unknown>, done: string) => {
    setBusyId(rule.id);
    try {
      await request;
      toast.success(done);
      setReads((n) => n + 1);
      void useTasks.getState().fetchBoard();
    } catch (error) {
      toast.error(getErrorMessage(error, t("Saqlashda xatolik yuz berdi")));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4"><DialogTitle>{t("Takrorlanuvchi topshiriqlar")}</DialogTitle></DialogHeader>
        <div className="flex-1 space-y-2 overflow-y-auto px-6 py-4">
          {rows === null && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
          {rows?.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("Takrorlanuvchi topshiriq yo'q. Topshiriq berishda «Batafsil» → «Takrorlanish» ni tanlang.")}</p>
          )}
          {rows?.map((r) => (
            <div key={r.id} className="space-y-1 rounded-lg border p-3 text-sm">
              <p className="font-medium">{r.title}</p>
              <p className="text-muted-foreground">
                {recurrenceLine(r, t)} · {r.active ? t("Keyingisi: {date}", { date: dayMonth(r.nextRunDate) }) : t("Takrorlanish to'xtatilgan")}
              </p>
              <p className="text-xs text-muted-foreground">{r.assignees.map((p) => personName(p)).join(", ") || "—"}</p>
              {r.canManage && (
                <div className="flex gap-2 pt-1">
                  <Button size="xs" variant="outline" disabled={busyId === r.id} onClick={() => void act(r, api.patch(`/tasks/recurrences/${r.id}`, { active: !r.active }), r.active ? t("Takrorlanish to'xtatildi") : t("Takrorlanish qayta yoqildi"))}>
                    {r.active ? t("To'xtatish") : t("Davom ettirish")}
                  </Button>
                  <Button size="xs" variant="ghost" className="text-destructive" disabled={busyId === r.id} onClick={() => setDeleting(r)}>{t("O'chirish")}</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
      <AlertDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Takrorlanishni o'chirasizmi?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("Yangi topshiriqlar berilmaydi. Berilgan topshiriqlar o'z joyida qoladi.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Bekor qilish")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => { if (deleting) void act(deleting, api.delete(`/tasks/recurrences/${deleting.id}`), t("Takrorlanish o'chirildi")); setDeleting(null); }}
            >
              {t("O'chirish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
