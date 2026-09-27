"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useIsMiniApp } from "@/hooks/use-is-mini-app";
import {
  MINI_APP_ENTRY_PATH,
  markMiniAppSignedOut,
} from "@/lib/telegram-mini-app";
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

// Logout with a styled confirmation (never the native confirm()). Two looks:
// a full-width danger ListRow for the More hub, a compact button for the rail.
export function LogoutButton({
  variant = "row",
}: {
  variant?: "row" | "rail";
}) {
  const [open, setOpen] = useState(false);
  const logout = useAuth((s) => s.logout);
  const clearSession = useAuth((s) => s.clearSession);
  const queryClient = useQueryClient();
  const router = useRouter();
  const inMiniApp = useIsMiniApp();

  function confirmLogout() {
    queryClient.clear();
    if (inMiniApp) {
      // The Mini App has no password form (ADR-0040): back to /tg, which
      // waits for «Qayta kirish» instead of signing straight back in.
      markMiniAppSignedOut(true);
      clearSession();
      router.replace(MINI_APP_ENTRY_PATH);
      return;
    }
    logout(); // clears cookies + redirects to /login
  }

  return (
    <>
      {variant === "row" ? (
        <ListRow
          icon={<SignOut weight="bold" />}
          label="Chiqish"
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
          aria-label="Chiqish"
        >
          <SignOut size={18} weight="bold" />
        </button>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="lumio">
          <AlertDialogHeader>
            <AlertDialogTitle>Hisobdan chiqasizmi?</AlertDialogTitle>
            <AlertDialogDescription>
              {inMiniApp
                ? "Qayta kirish uchun «Qayta kirish» tugmasini bosasiz — parol kerak emas."
                : "Qayta kirish uchun telefon raqamingiz va parolingiz kerak bo'ladi."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLogout}
              variant="destructive"
            >
              Chiqish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
