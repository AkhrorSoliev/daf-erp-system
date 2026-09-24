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
import { useLogoutOthers } from "@/hooks/use-logout-others";

interface LogoutOthersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `"lumio"` on the student portal. Radix portals the content to
   * `document.body`, outside the page's `.lumio` wrapper, so the skin has to
   * be set on the content itself (same as `student-logout-button.tsx`).
   */
  contentClassName?: string;
}

/**
 * Confirmation for "Boshqa qurilmalardan chiqish" (ADR-0030), shared by the
 * staff profile and student portal Settings — one confirmation, two skins,
 * like the portal's own sign-out.
 */
export function LogoutOthersDialog({
  open,
  onOpenChange,
  contentClassName,
}: LogoutOthersDialogProps) {
  const { logoutOthers, pending } = useLogoutOthers();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={contentClassName}>
        <AlertDialogHeader>
          <AlertDialogTitle>Boshqa qurilmalardan chiqilsinmi?</AlertDialogTitle>
          <AlertDialogDescription>
            Boshqa barcha qurilma va brauzerlardagi kirishlar darhol tugatiladi.
            Bu qurilmada qolasiz.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Bekor qilish</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={async (event) => {
              // Keep the dialog open until the request settles.
              event.preventDefault();
              if (await logoutOthers()) onOpenChange(false);
            }}
          >
            {pending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : null}
            Chiqish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
