"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { downloadAuthedFile } from "@/lib/download-file";
import { getErrorMessage } from "@/lib/get-error-message";
import { useIsMiniApp } from "@/hooks/use-is-mini-app";
import { Button, Card, IconTile } from "./lumio";
import { DownloadSimple, FileText, TelegramLogo } from "./lumio/icon";

export const SENT_TO_TELEGRAM = "Hisobot Telegram chatingizga yuborildi";

/**
 * What a tap does. Telegram's WebView cannot save a file, so inside the Mini
 * App the bot sends the PDF to the student's chat instead (the same message
 * and file as its «💳 To'lovlar»). The web portal downloads it.
 */
export async function deliverStatement(isMiniApp: boolean): Promise<void> {
  if (isMiniApp) {
    await api.post("/student-portal/statement/telegram");
    return;
  }
  await downloadAuthedFile(
    "/student-portal/statement.pdf",
    "tolovlar-hisoboti.pdf",
  );
}

/**
 * The student's own payment statement (ADR-0037) as a PDF:
 * `GET /student-portal/statement.pdf`, whose student comes from the token.
 */
export function StatementCard() {
  const isMiniApp = useIsMiniApp();
  const [busy, setBusy] = useState(false);

  async function deliver() {
    setBusy(true);
    try {
      await deliverStatement(isMiniApp);
      if (isMiniApp) toast.success(SENT_TO_TELEGRAM);
    } catch (err) {
      toast.error(
        isMiniApp
          ? getErrorMessage(err, "Hisobotni Telegram'ga yuborib bo'lmadi")
          : "PDF yuklab olishda xatolik",
      );
    } finally {
      setBusy(false);
    }
  }

  // A size container: a phone keeps the full-width button under the text, a
  // wider card puts it beside the text instead of spending a row on it.
  return (
    <Card className="@container">
      <div className="flex flex-col gap-4 @sm:flex-row @sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <IconTile icon={<FileText weight="bold" />} tone="coral" />
          <div className="min-w-0 space-y-1">
            <h2 className="font-display text-lg font-bold text-ink-900">
              To&apos;lovlar hisoboti
            </h2>
            <p className="text-sm text-ink-500">
              Har bir to&apos;lovingiz qaysi darslarga ketgani, oyma-oy
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          iconBefore={
            isMiniApp ? (
              <TelegramLogo weight="bold" />
            ) : (
              <DownloadSimple weight="bold" />
            )
          }
          onClick={deliver}
          className="w-full @sm:w-auto @sm:shrink-0"
        >
          {isMiniApp ? "Telegram'ga yuborish" : "PDF yuklab olish"}
        </Button>
      </div>
    </Card>
  );
}
