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
}

export function LogoutOthersDialog({
  open,
  onOpenChange,
}: LogoutOthersDialogProps) {
  const { logoutOthers, pending } = useLogoutOthers();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
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
