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
import { useT } from "@/i18n/context";
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
  const t = useT();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!advance) return;
    setDeleting(true);
    try {
      await api.delete(`/expenses/${advance.id}`);
      toast.success(t("Avans o'chirildi"));
      onOpenChange(false);
      onDeleted();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t("O'chirishda xatolik")));
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
          <AlertDialogTitle>{t("Avansni o'chirasizmi?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {advance
              ? t(
                  "{name} — {amount} so'm, {date}. Pul kassaga qaytariladi va bu avans keyingi oylik hisobiga tushmaydi. Bu amalni qaytarib bo'lmaydi.",
                  { name: advance.employeeName, amount: formatPrice(advance.amount), date: day(advance.date) },
                )
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            {t("Bekor qilish")}
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
            {t("O'chirish")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
