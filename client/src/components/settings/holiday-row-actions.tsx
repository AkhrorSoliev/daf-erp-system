"use client";

import { useState } from "react";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { useEditHoliday, type Holiday } from "@/hooks/use-edit-holiday";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

interface HolidayRowActionsProps {
  holiday: Holiday;
  onDeleted?: (id: string) => void;
}

export function HolidayRowActions({
  holiday,
  onDeleted,
}: HolidayRowActionsProps) {
  const { openDrawer } = useEditHoliday();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/holidays/${holiday.id}`);
      toast.success("Bayram muvaffaqiyatli o'chirildi");
      onDeleted?.(holiday.id);
      setConfirmOpen(false);
    } catch (err) {
      toast.error(
        getErrorMessage(err, "Bayramni o'chirishda xatolik yuz berdi"),
      );
    } finally {
      setDeleting(false);
    }
  };

  const formattedDate = holiday.date
    ? format(new Date(holiday.date), "dd.MM.yyyy")
    : "";

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
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="size-4" />
                )}
                <span className="sr-only">Amallar</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Amallar</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => openDrawer(holiday)}>
            <Pencil className="mr-2 size-4" />
            Tahrirlash
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="mr-2 size-4" />
            O&apos;chirish
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Bayramni o&apos;chirishni xohlaysizmi?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{holiday.name}</span>
              {formattedDate ? ` (${formattedDate})` : ""} bayrami o&apos;chiriladi.
              Bu amalni keyinroq qaytarib bo&apos;lmaydi. Bayram arxivga
              ko&apos;chadi va davomat tekshiruvi uchun ishlatilmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              Bekor qilish
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              O&apos;chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
