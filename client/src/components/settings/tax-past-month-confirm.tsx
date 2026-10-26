"use client";

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

/**
 * O'tgan oydan boshlab stavka o'zgarsa, o'sha oylarning foydasi qayta
 * hisoblanadi. Shuning uchun bunday saqlash oldin so'raladi.
 */
export function TaxPastMonthConfirm({
  month,
  onCancel,
  onConfirm,
}: {
  /** Tasdiq so'ralayotgan oy (YYYY-MM); `null` bo'lsa oyna yopiq. */
  month: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <AlertDialog open={month !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Stavkani o'zgartirasizmi?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("{oy} dan boshlab o'tgan oylar foydasi qayta hisoblanadi. Davom etasizmi?", { oy: month ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Bekor qilish")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t("Davom etish")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
