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
import { reapplyLines, type RateReapplySummary } from "./salary-config-reapply";

interface Props {
  /** The preview to confirm; null keeps the dialog closed. */
  summary: RateReapplySummary | null;
  /** "24.09.2026" — the rate's start date as the user picked it. */
  fromLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Asked before a rate save that reaches lessons already written (ADR-0050):
 * how many, and what their pay becomes. The figures come from the server's
 * preview, which runs the save and rolls it back.
 */
export function SalaryConfigReapplyDialog({
  summary,
  fromLabel,
  onCancel,
  onConfirm,
}: Props) {
  const lines = summary ? reapplyLines(summary, fromLabel) : null;

  return (
    <AlertDialog open={!!summary} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Oldingi darslar ham qayta hisoblanadi</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              {lines?.main && (
                <p className="text-foreground">{lines.main}</p>
              )}
              {lines?.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Saqlash</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
