"use client";
import { useState } from "react";
import { Camera, Check, Loader2, Play, Undo2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { TaskAccess, TaskDetail } from "@/hooks/use-tasks";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { footerActions } from "./task-drawer-footer-rules";
import { photoFirst } from "./task-file-rules";
import { TaskPhotoDialog } from "./task-photo-dialog";
import { useTaskFiles } from "./use-task-files";
import { useTaskWrite } from "./use-task-write";

type Move = "IN_PROGRESS" | "IN_REVIEW" | "DONE";
const MOVED: Record<Move, string> = { IN_PROGRESS: msg("Topshiriq boshlandi"), IN_REVIEW: msg("Tekshiruvga yuborildi"), DONE: msg("Topshiriq bajarildi") };

/** The buttons come from `footerActions` (what the server allows); this draws them and asks the questions. */
export function TaskDrawerFooter({ task, access }: { task: TaskDetail; access: TaskAccess }) {
  const t = useT();
  const me = useAuth((s) => s.user?.id);
  const { busy, run } = useTaskWrite();
  const [warn, setWarn] = useState<Move | null>(null);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const hasFreshPhoto = useTaskFiles((s) => (s.taskId === task.id ? s.hasFreshPhoto : false));
  const filesOn = useTaskFiles((s) => s.enabled === true);
  const [photoOpen, setPhotoOpen] = useState(false);

  const actions = footerActions(task, access, me);
  const finish = actions.done?.target;
  // With files off the plain «Bajardim» stays; the server's 400 then asks for the photo.
  const needPhoto = finish !== undefined && filesOn && photoFirst(task, finish, hasFreshPhoto);
  const unchecked = task.stepsTotal - task.stepsDone;
  if (!actions.start && !actions.done && !actions.accept && !actions.return && !actions.label) return null;

  const send = async (to: Move) => {
    const moved = MOVED[to];
    if (await run(api.post(`/tasks/${task.id}/status`, { status: to }), t("Holatni o'zgartirishda xatolik yuz berdi"))) toast.success(t(moved));
  };
  const move = (to: Move) => {
    // Sending off a task with steps left open is allowed, but asked about first.
    if (to !== "IN_PROGRESS" && unchecked > 0) setWarn(to);
    else void send(to);
  };
  const review = async (action: "ACCEPT" | "RETURN") => {
    const ok = await run(
      api.post(`/tasks/${task.id}/review`, action === "RETURN" ? { action, reason: reason.trim() } : { action }),
      t("Tekshirishda xatolik yuz berdi"),
    );
    if (ok) {
      toast.success(action === "ACCEPT" ? t("Topshiriq qabul qilindi") : t("Topshiriq qaytarildi"));
      setReturning(false);
      setReason("");
    }
  };

  return (
    <footer className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
      {actions.label && <span className="mr-auto text-xs text-muted-foreground">{t(actions.label)}</span>}
      {actions.start && (
        <Button variant="outline" disabled={busy} onClick={() => move("IN_PROGRESS")}><Play className="mr-1 size-4" />{t("Boshladim")}</Button>
      )}
      {finish && needPhoto && (
        <Button disabled={busy} onClick={() => setPhotoOpen(true)}><Camera className="mr-1 size-4" />{t("Rasm qo'shib, tekshiruvga yuborish")}</Button>
      )}
      {finish && !needPhoto && (
        <Button disabled={busy} onClick={() => move(finish)}>
          {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Check className="mr-1 size-4" />}{t("Bajardim")}
        </Button>
      )}
      {actions.return && (
        <Button variant="outline" disabled={busy} onClick={() => setReturning(true)}><Undo2 className="mr-1 size-4" />{t("Qaytarib yuborish")}</Button>
      )}
      {actions.accept && (
        <Button disabled={busy} onClick={() => void review("ACCEPT")}>
          {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Check className="mr-1 size-4" />}{t("Qabul qilish")}
        </Button>
      )}

      <TaskPhotoDialog task={task} open={photoOpen} onOpenChange={setPhotoOpen} onSend={() => move("IN_REVIEW")} />

      <AlertDialog open={warn !== null} onOpenChange={(o) => { if (!o) setWarn(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("{n} ta qadam belgilanmagan — baribir yuborasizmi?", { n: unchecked })}</AlertDialogTitle>
            <AlertDialogDescription>
              {warn === "DONE" ? t("Topshiriq qadamlari tugallanmagan holda bajarildi deb belgilanadi.") : t("Topshiriq qadamlari tugallanmagan holda beruvchiga tekshirish uchun yuboriladi.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Bekor qilish")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (warn) void send(warn); }}>{t("Baribir yuborish")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={returning} onOpenChange={(o) => { if (!busy) { setReturning(o); if (!o) setReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Topshiriqni qaytarish")}</AlertDialogTitle>
            <AlertDialogDescription>{t("Ijrochi nima to'g'rilashi kerakligini yozing — u buni muhokamada ko'radi.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea aria-label={t("Qaytarish sababi")} autoFocus rows={3} maxLength={1000} placeholder={t("Sabab")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("Bekor qilish")}</AlertDialogCancel>
            <AlertDialogAction disabled={busy || !reason.trim()} onClick={(e) => { e.preventDefault(); void review("RETURN"); }}>
              {busy && <Loader2 className="mr-1 size-4 animate-spin" />}{t("Qaytarib yuborish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </footer>
  );
}
