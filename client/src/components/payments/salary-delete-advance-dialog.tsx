"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
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
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import type { EditableAdvance } from "./advance-row-actions";

/** "2026-09-15" → "15.09.2026". */
function day(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Avansni o'chirish tasdig'i. Ikkala ro'yxat ham shuni ishlatadi — matn bitta
 * joyda tursin. O'chirish server tomonda daftar yozuvini teskari yozadi va
 * pulni kassaga qaytaradi, shuning uchun tasdiq matni buni aniq aytadi.
 */
export function SalaryDeleteAdvanceDialog({
  advance,
  onOpenChange,
  onDeleted,
}: {
  advance: EditableAdvance | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!advance) return;
    setDeleting(true);
    try {
      await api.delete(`/expenses/${advance.id}`);
      toast.success("Avans o'chirildi");
      onOpenChange(false);
      onDeleted();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={!!advance}
      onOpenChange={(v) => {
        if (!v && !deleting) onOpenChange(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Avansni o&apos;chirasizmi?</AlertDialogTitle>
          <AlertDialogDescription>
            {advance
              ? `${advance.employeeName} — ${formatPrice(advance.amount)} so'm, ${day(advance.date)}. Pul kassaga qaytariladi va bu avans keyingi oylik hisobiga tushmaydi. Bu amalni qaytarib bo'lmaydi.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            Bekor qilish
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(ev) => {
              ev.preventDefault();
              void handleDelete();
            }}
            disabled={deleting}
            variant="destructive"
          >
            {deleting && <Loader2 className="size-4 animate-spin mr-2" />}
            O&apos;chirish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
