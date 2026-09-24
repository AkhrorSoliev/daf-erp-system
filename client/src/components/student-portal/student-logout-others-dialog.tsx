"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLogoutOthers } from "@/hooks/use-logout-others";
import { Button } from "./lumio";

export interface StudentLogoutOthersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StudentLogoutOthersDialog({
  open,
  onOpenChange,
}: StudentLogoutOthersDialogProps) {
  const { logoutOthers, pending } = useLogoutOthers();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lumio sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">
            Boshqa qurilmalardan chiqish
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-ink-500">
          Boshqa barcha telefon va kompyuterlardagi kirishlar tugatiladi. Bu
          qurilmada qolasiz.
        </p>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Bekor qilish
          </Button>
          <Button
            type="button"
            loading={pending}
            onClick={async () => {
              if (await logoutOthers()) onOpenChange(false);
            }}
          >
            Chiqish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
