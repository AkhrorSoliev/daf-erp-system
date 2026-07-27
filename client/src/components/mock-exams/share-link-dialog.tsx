"use client";

import { useState } from "react";
import { Check, Copy, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildBotLink,
  isTelegramBotConfigured,
  TELEGRAM_BOT_NOT_CONFIGURED,
} from "@/lib/telegram-link";

interface ShareLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examTitle: string;
  botStartPayload: string;
  registrationOpen: boolean;
}

export function ShareLinkDialog({
  open,
  onOpenChange,
  examTitle,
  botStartPayload,
  registrationOpen,
}: ShareLinkDialogProps) {
  const [copied, setCopied] = useState(false);
  const botLink = buildBotLink(`mock_${botStartPayload}`);
  const url = botLink ?? `t.me/<BOT>?start=mock_${botStartPayload}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Havola nusxalandi");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Nusxalashda xatolik");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ro&apos;yxatga olish havolasi</DialogTitle>
          <DialogDescription>
            Ushbu havolani ulashing — foydalanuvchi havolaga bosib Telegram bot
            orqali &quot;{examTitle}&quot; imtihoniga ro&apos;yxatga olinadi.
          </DialogDescription>
        </DialogHeader>

        {!registrationOpen && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Imtihon holati &quot;Ro&apos;yxat ochiq&quot; emas — havola
            ishlamaydi. Avval imtihonni REGISTRATION_OPEN holatiga
            o&apos;tkazing.
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Havola</label>
            <div className="flex gap-2">
              <Input value={url} readOnly className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="size-4 text-green-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <label className="self-start text-xs text-muted-foreground">
              QR kod
            </label>
            <div className="w-full max-w-64 rounded-lg border bg-white p-4">
              <QRCodeSVG value={url} className="h-auto w-full" level="M" />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <QrCode className="size-3" />
              QR kodni skanerlash orqali ham havolani ochish mumkin
            </p>
          </div>

          {!isTelegramBotConfigured && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {TELEGRAM_BOT_NOT_CONFIGURED}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
