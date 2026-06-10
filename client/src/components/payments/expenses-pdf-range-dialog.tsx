"use client";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ExpensesPdfRangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "range" = keep the selected date range; "all" = ignore date bounds. */
  onSelect: (scope: "range" | "all") => void;
}

/**
 * Shown when the user clicks PDF while a date range is active — lets them choose
 * whether the PDF covers the selected range or the whole period (other filters
 * stay applied either way).
 */
export function ExpensesPdfRangeDialog({
  open,
  onOpenChange,
  onSelect,
}: ExpensesPdfRangeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>PDF qaysi davr uchun?</AlertDialogTitle>
          <AlertDialogDescription>
            Sana oralig&apos;i tanlangan. PDF faqat tanlangan oraliq uchunmi
            yoki butun davr uchun chiqarilsinmi?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
          <Button variant="outline" onClick={() => onSelect("all")}>
            Butun davr
          </Button>
          <Button onClick={() => onSelect("range")}>Tanlangan oraliq</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
