"use client";
import { useState } from "react";
import { Check, Loader2, Play, Undo2 } from "lucide-react";
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
import { useTaskWrite } from "./use-task-write";

type Move = "IN_PROGRESS" | "IN_REVIEW" | "DONE";
const MOVED: Record<Move, string> = { IN_PROGRESS: "Topshiriq boshlandi", IN_REVIEW: "Tekshiruvga yuborildi", DONE: "Topshiriq bajarildi" };

/**
 * What the viewer can do with the task now, mirroring the server's table
 * (task-transitions.ts): the assignee starts and finishes, the author reviews,
 * and a system task is only ever started by hand, because it closes itself.
 */
export function TaskDrawerFooter({ task, access }: { task: TaskDetail; access: TaskAccess }) {
  const me = useAuth((s) => s.user?.id);
  const { busy, run } = useTaskWrite();
  const [warn, setWarn] = useState<Move | null>(null);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");

  const system = task.kind !== "MANUAL";
  // The author is the only assignee: their task skips the review step.
  const isSelf = me !== undefined && task.author?.id === me && task.assignees.length === 1 && task.assignees[0].id === me;
  const unchecked = task.stepsTotal - task.stepsDone;
  const working = access.isAssignee && (task.status === "NEW" || task.status === "IN_PROGRESS");
  const canStart = working && task.status === "NEW";
  const canFinish = working && !system;
  const canReview = access.canManage && !system && task.status === "IN_REVIEW";
  const waiting = access.isAssignee && !system && task.status === "IN_REVIEW" && !canReview;
  if (!canStart && !canFinish && !canReview && !waiting) return null;

  const send = async (to: Move) => {
    if (await run(api.post(`/tasks/${task.id}/status`, { status: to }), "Holatni o'zgartirishda xatolik yuz berdi")) toast.success(MOVED[to]);
  };
  const move = (to: Move) => {
    // Sending off a task with steps left open is allowed, but asked about first.
    if (to !== "IN_PROGRESS" && unchecked > 0) setWarn(to);
    else void send(to);
  };
  const review = async (action: "ACCEPT" | "RETURN") => {
    const ok = await run(
      api.post(`/tasks/${task.id}/review`, action === "RETURN" ? { action, reason: reason.trim() } : { action }),
      "Tekshirishda xatolik yuz berdi",
    );
    if (ok) {
      toast.success(action === "ACCEPT" ? "Topshiriq qabul qilindi" : "Topshiriq qaytarildi");
      setReturning(false);
      setReason("");
    }
  };
  const finishTo: Move = isSelf ? "DONE" : "IN_REVIEW";

  return (
    <footer className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
      {waiting && <span className="mr-auto text-xs text-muted-foreground">Beruvchi tekshirmoqda</span>}
      {canStart && (
        <Button variant="outline" disabled={busy} onClick={() => move("IN_PROGRESS")}><Play className="mr-1 size-4" />Boshladim</Button>
      )}
      {canFinish && (
        <Button disabled={busy} onClick={() => move(finishTo)}>
          {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Check className="mr-1 size-4" />}Bajardim
        </Button>
      )}
      {canReview && (
        <>
          <Button variant="outline" disabled={busy} onClick={() => setReturning(true)}><Undo2 className="mr-1 size-4" />Qaytarish</Button>
          <Button disabled={busy} onClick={() => void review("ACCEPT")}>
            {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Check className="mr-1 size-4" />}Qabul qilish
          </Button>
        </>
      )}

      <AlertDialog open={warn !== null} onOpenChange={(o) => { if (!o) setWarn(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{unchecked} ta qadam belgilanmagan — baribir yuborasizmi?</AlertDialogTitle>
            <AlertDialogDescription>
              {warn === "DONE" ? "Topshiriq qadamlari tugallanmagan holda bajarildi deb belgilanadi." : "Topshiriq qadamlari tugallanmagan holda beruvchiga tekshirish uchun yuboriladi."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (warn) void send(warn); }}>Baribir yuborish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={returning} onOpenChange={(o) => { if (!busy) { setReturning(o); if (!o) setReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Topshiriqni qaytarish</AlertDialogTitle>
            <AlertDialogDescription>Ijrochi nima to&apos;g&apos;rilashi kerakligini yozing — u buni muhokamada ko&apos;radi.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea aria-label="Qaytarish sababi" autoFocus rows={3} maxLength={1000} placeholder="Sabab" value={reason} onChange={(e) => setReason(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction disabled={busy || !reason.trim()} onClick={(e) => { e.preventDefault(); void review("RETURN"); }}>
              {busy && <Loader2 className="mr-1 size-4 animate-spin" />}Qaytarish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </footer>
  );
}
