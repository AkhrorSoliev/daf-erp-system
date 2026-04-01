"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, RefreshCw, History } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChangeStatusDialog } from "@/components/shared/change-status-dialog";
import { StatusHistoryDialog } from "@/components/shared/status-history-dialog";
import { useEditTeacher, type TeacherData } from "@/hooks/use-edit-teacher";
import api from "@/lib/api";

interface TeacherRowActionsProps {
  teacher: TeacherData;
  onDeleted?: (id: number) => void;
  onStatusChanged?: (id: number, newStatus: string) => void;
}

export function TeacherRowActions({ teacher, onDeleted, onStatusChanged }: TeacherRowActionsProps) {
  const { openDrawer } = useEditTeacher();
  const [showDelete, setShowDelete] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  const handleDelete = async () => {
    setDeleting(true);
    setShowDelete(false);
    onDeleted?.(teacher.id);
    try {
      await api.delete(`/teachers/${teacher.id}`);
      toast.success("O'qituvchi muvaffaqiyatli o'chirildi");
    } catch (error: any) {
      const msg = error?.response?.data?.message || "O'chirishda xatolik yuz berdi";
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setDeleting(false);
      setDeleteReason("");
    }
  };

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Amallar</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Amallar</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => openDrawer(teacher)}>
            <Pencil className="mr-2 size-4" />
            Tahrirlash
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowStatus(true)}>
            <RefreshCw className="mr-2 size-4" />
            Status o&apos;zgartirish
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowHistory(true)}>
            <History className="mr-2 size-4" />
            Status tarixi
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="mr-2 size-4" />
            O&apos;chirish
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>O&apos;chirishni tasdiqlang</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{`${teacher.firstName} ${teacher.lastName}`}</strong> o&apos;qituvchisini arxivga o&apos;tkazilsinmi?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Textarea
              placeholder="Sabab yozing (ixtiyoriy)..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "O'chirilmoqda..." : "O'chirish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChangeStatusDialog
        open={showStatus}
        onOpenChange={setShowStatus}
        entityType="teachers"
        entityId={teacher.id}
        entityName={`${teacher.firstName} ${teacher.lastName}`}
        currentStatus={teacher.status || "ACTIVE"}
        onStatusChanged={(newStatus) => onStatusChanged?.(teacher.id, newStatus)}
      />

      <StatusHistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        entityType="teachers"
        entityId={teacher.id}
        entityName={`${teacher.firstName} ${teacher.lastName}`}
      />
    </>
  );
}
