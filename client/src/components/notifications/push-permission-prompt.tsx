"use client";

import { useState } from "react";
import { BellOff, BellRing, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useIsMiniApp } from "@/hooks/use-is-mini-app";

/**
 * Keeps asking staff to turn push on until they do: a dialog on every visit
 * (the header never remounts within one, so it opens once per page load) and
 * a banner that stays until permission is granted. When the browser has
 * blocked the site it may not ask again, so the banner explains how to unblock.
 */
export function PushPermissionPrompt() {
  const { state, enable } = usePushNotifications();
  const isMiniApp = useIsMiniApp();
  const [dialogOpen, setDialogOpen] = useState(true);

  // Telegram's webview has no Web Push
  if (isMiniApp) return null;

  if (state === "denied") {
    return (
      <div className="flex items-start gap-2 border-t bg-warning/10 px-3 py-2 text-sm sm:px-4">
        <Lock className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>
          Bildirishnomalar bloklangan. Manzil satrining chap tomonidagi belgini bosing,
          «Bildirishnomalar»ni «Ruxsat berish»ga o&apos;zgartiring va sahifani yangilang.
        </span>
      </div>
    );
  }

  if (state !== "default") return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-warning/10 px-3 py-2 text-sm sm:px-4">
        <BellOff className="size-4 shrink-0 text-warning" />
        <span className="flex-1">
          Bildirishnomalar o&apos;chiq. Vazifa, dars va davomat haqidagi xabarlar sizga kelmaydi.
        </span>
        <Button size="sm" variant="outline" onClick={enable}>
          Yoqish
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="items-center text-center">
            <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-warning/10 text-warning">
              <BellRing className="size-5" />
            </div>
            <DialogTitle>Bildirishnomalarni yoqing</DialogTitle>
            <DialogDescription>
              Yangi vazifa, dars va davomat haqidagi xabarlarni darhol olasiz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Keyinroq
            </Button>
            <Button
              onClick={() => {
                setDialogOpen(false);
                enable();
              }}
            >
              Yoqish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
