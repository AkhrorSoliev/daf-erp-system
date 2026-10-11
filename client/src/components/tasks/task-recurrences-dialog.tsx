"use client";
import { useEffect, useState } from "react";
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
import { dayMonth, recurrenceLine } from "@/lib/task-recurrence-rules";
import { personName } from "./task-feed-text";

/** «Takrorlanuvchi» next to «Yangi topshiriq»: the rules this person may manage (spec §9.5 `GET /tasks/recurrences`). */
export function TaskRecurrencesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} aria-label="Takrorlanuvchi topshiriqlar">
        <Repeat className="size-4 sm:mr-1" /><span className="hidden sm:inline">Takrorlanuvchi</span>
      </Button>
      {open && <RecurrencesDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function RecurrencesDialog({ onClose }: { onClose: () => void }) {
  // `null` = loading.
  const [rows, setRows] = useState<TaskRecurrenceView[] | null>(null);
  const [reads, setReads] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TaskRecurrenceView | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<{ data: TaskRecurrenceView[] }>("/tasks/recurrences")
      .then(({ data }) => { if (alive) setRows(data.data); })
      .catch((error) => { if (alive) { setRows([]); toast.error(getErrorMessage(error, "Ro'yxatni yuklashda xatolik")); } });
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
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4"><DialogTitle>Takrorlanuvchi topshiriqlar</DialogTitle></DialogHeader>
        <div className="flex-1 space-y-2 overflow-y-auto px-6 py-4">
          {rows === null && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
          {rows?.length === 0 && (
            <p className="text-sm text-muted-foreground">{"Takrorlanuvchi topshiriq yo'q. Topshiriq berishda «Batafsil» → «Takrorlash» ni tanlang."}</p>
          )}
          {rows?.map((r) => (
            <div key={r.id} className="space-y-1 rounded-lg border p-3 text-sm">
              <p className="font-medium">{r.title}</p>
              <p className="text-muted-foreground">
                {recurrenceLine(r)} · {r.active ? `keyingisi ${dayMonth(r.nextRunDate)}` : "to'xtatilgan"}
              </p>
              <p className="text-xs text-muted-foreground">{r.assignees.map((p) => personName(p)).join(", ") || "—"}</p>
              {r.canManage && (
                <div className="flex gap-2 pt-1">
                  <Button size="xs" variant="outline" disabled={busyId === r.id} onClick={() => void act(r, api.patch(`/tasks/recurrences/${r.id}`, { active: !r.active }), r.active ? "Takrorlanish to'xtatildi" : "Takrorlanish qayta yoqildi")}>
                    {r.active ? "To'xtatish" : "Davom ettirish"}
                  </Button>
                  <Button size="xs" variant="ghost" className="text-destructive" disabled={busyId === r.id} onClick={() => setDeleting(r)}>{"O'chirish"}</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
      <AlertDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{"Takrorlanishni o'chirasizmi?"}</AlertDialogTitle>
            <AlertDialogDescription>{"Yangi topshiriqlar berilmaydi. Berilgan topshiriqlar o'z joyida qoladi."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => { if (deleting) void act(deleting, api.delete(`/tasks/recurrences/${deleting.id}`), "Takrorlanish o'chirildi"); setDeleting(null); }}
            >
              {"O'chirish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
