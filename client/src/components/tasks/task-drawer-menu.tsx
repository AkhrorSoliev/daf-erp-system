"use client";
import { useState } from "react";
import { Ban, Copy, Loader2, MoreHorizontal } from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskAccess, type TaskDetail } from "@/hooks/use-tasks";
import { isOpenStatus } from "./task-labels";
import { useTaskWrite } from "./use-task-write";

/** «Nusxa olish» and «Bekor qilish»; draws nothing when the viewer has neither. */
export function TaskDrawerMenu({ task, access }: { task: TaskDetail; access: TaskAccess }) {
  const { busy, run } = useTaskWrite();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [copying, setCopying] = useState(false);
  // The server copies and cancels manual tasks only; a system task closes itself.
  const manual = task.kind === "MANUAL";
  const canCancel = manual && access.canManage && isOpenStatus(task.status);
  if (!manual) return null;

  const duplicate = async () => {
    setCopying(true);
    try {
      await api.post(`/tasks/${task.id}/duplicate`);
      toast.success("Topshiriqdan nusxa olindi");
      void useTasks.getState().fetchBoard();
    } catch (error) {
      toast.error(getErrorMessage(error, "Nusxa olishda xatolik yuz berdi"));
    } finally {
      setCopying(false);
    }
  };
  const cancel = async () => {
    const ok = await run(api.post(`/tasks/${task.id}/cancel`, { reason: reason.trim() || undefined }), "Bekor qilishda xatolik yuz berdi");
    if (ok) {
      toast.success("Topshiriq bekor qilindi");
      setCancelling(false);
      setReason("");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" disabled={copying}>
            {copying ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
            <span className="sr-only">Amallar</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void duplicate()}><Copy className="mr-2 size-4" />Nusxa olish</DropdownMenuItem>
          {canCancel && (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setCancelling(true)}>
              <Ban className="mr-2 size-4" />Bekor qilish
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={cancelling} onOpenChange={(o) => { if (!busy) { setCancelling(o); if (!o) setReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Topshiriq bekor qilinsinmi?</AlertDialogTitle>
            <AlertDialogDescription>Topshiriq yopiladi — uni qayta ochib bo&apos;lmaydi.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea aria-label="Bekor qilish sababi" rows={3} maxLength={1000} placeholder="Sabab (ixtiyoriy)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Orqaga</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={(e) => { e.preventDefault(); void cancel(); }}>
              {busy && <Loader2 className="mr-1 size-4 animate-spin" />}Bekor qilish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
