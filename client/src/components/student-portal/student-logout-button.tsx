"use client";

import { useState } from "react";
import { useIsMiniApp } from "@/hooks/use-is-mini-app";
import { useSignOut } from "@/hooks/use-sign-out";
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
import { cn } from "@/lib/utils";
import { SignOut } from "@phosphor-icons/react";
import { ListRow } from "./lumio/list-row";
import { useT } from "@/i18n/context";

// Logout with a styled confirmation (never the native confirm()). Two looks:
// a full-width danger ListRow for the More hub, a compact button for the rail.
export function LogoutButton({
  variant = "row",
}: {
  variant?: "row" | "rail";
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const inMiniApp = useIsMiniApp();
  // Inside the Mini App: back to /tg «Qayta kirish» (ADR-0040).
  const confirmLogout = useSignOut();

  return (
    <>
      {variant === "row" ? (
        <ListRow
          icon={<SignOut weight="bold" />}
          label={t("Chiqish")}
          danger
          chevron={false}
          onClick={() => setOpen(true)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-danger transition-colors hover:bg-danger/10",
          )}
          aria-label={t("Chiqish")}
        >
          <SignOut size={18} weight="bold" />
        </button>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="lumio">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Hisobdan chiqasizmi?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {inMiniApp
                ? t(
                    "Qayta kirish uchun {button} tugmasini bosasiz — parol kerak emas.",
                    { button: "«Qayta kirish»" },
                  )
                : t(
                    "Qayta kirish uchun telefon raqamingiz va parolingiz kerak bo'ladi.",
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Bekor qilish")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLogout}
              variant="destructive"
            >
              {t("Chiqish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
