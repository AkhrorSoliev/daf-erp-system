"use client";

import { Loader2 } from "lucide-react";
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
import type { ConfirmCopy } from "./permissions-model";

interface PermissionConfirmDialogProps {
  copy: ConfirmCopy | null;
  open: boolean;
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  /**
   * The server would refuse the change (`ConfirmPlan.refusal`): the dialog
   * shows why and offers no confirm button, so nothing is sent.
   */
  refusal?: string | null;
  /** Turning a capability off: the confirm button is red. */
  destructive?: boolean;
}

/**
 * The one confirmation of the «Ruxsatlar» page: the question, the
 * capabilities that move with it («Birga yoqiladi» / «Birga o'chadi») and
 * the money warning. Every word comes from `permissions-model.ts`. Nothing is
 * saved before the confirm button, and the dialog stays open while the save
 * runs.
 */
export function PermissionConfirmDialog({
  copy,
  open,
  pending,
  onConfirm,
  onOpenChange,
  refusal = null,
  destructive = false,
}: PermissionConfirmDialogProps) {
  const t = useT();
  return (
    <AlertDialog
      open={open && copy !== null}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      {/* Safety floor: a tall dialog scrolls inside instead of leaving the screen. */}
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        {copy && refusal && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("O'zgartirib bo'lmaydi")}</AlertDialogTitle>
              <AlertDialogDescription>{refusal}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("Yopish")}</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        )}

        {copy && !refusal && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("O'zgarish xodimning keyingi bosishida kuchga kiradi.")}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {copy.alsoLabels.length > 0 && (
              <div className="space-y-1.5 text-sm">
                {copy.alsoTitle && <p className="font-medium">{copy.alsoTitle}:</p>}
                {/* A long cascade (turning off «O'quvchi profilini ochish») scrolls here; title and buttons stay. */}
                <ul className="max-h-[40dvh] list-disc space-y-1 overflow-y-auto overscroll-contain pl-5 text-muted-foreground">
                  {copy.alsoLabels.map((label, index) => (
                    <li key={`${index}-${label}`}>{label}</li>
                  ))}
                </ul>
              </div>
            )}

            {copy.warning && (
              <p
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              >
                {copy.warning}
              </p>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>{t("Bekor qilish")}</AlertDialogCancel>
              <AlertDialogAction
                variant={destructive ? "destructive" : "default"}
                disabled={pending}
                onClick={(event) => {
                  // AlertDialogAction closes the dialog on click; keep it open until the save answers.
                  event.preventDefault();
                  onConfirm();
                }}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {copy.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
