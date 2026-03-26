"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditTeacher, type TeacherData } from "@/hooks/use-edit-teacher";
import api from "@/lib/api";

interface TeacherRowActionsProps {
  teacher: TeacherData;
  onDeleted?: () => void;
}

export function TeacherRowActions({ teacher, onDeleted }: TeacherRowActionsProps) {
  const { openDrawer } = useEditTeacher();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/teachers/${teacher.id}`);
      toast.success("O'qituvchi muvaffaqiyatli o'chirildi");
      onDeleted?.();
    } catch (error: any) {
      const msg = error?.response?.data?.message || "O'chirishda xatolik yuz berdi";
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setDeleting(false);
      setShowDelete(false);
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
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => openDrawer(teacher)}>
            <Pencil className="mr-2 size-4" />
            Tahrirlash
          </DropdownMenuItem>
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
              <strong>{teacher.name}</strong> o&apos;qituvchisini o&apos;chirmoqchimisiz?
              Bu amalni qaytarib bo&apos;lmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
    </>
  );
}
