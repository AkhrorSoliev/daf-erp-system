"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { downloadAuthedFile } from "@/lib/download-file";
import { Button, Card, IconTile } from "./lumio";
import { DownloadSimple, FileText } from "./lumio/icon";

/**
 * The student's own payment statement (ADR-0037) as a PDF:
 * `GET /student-portal/statement.pdf`, whose student comes from the token.
 */
export function StatementCard() {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      await downloadAuthedFile(
        "/student-portal/statement.pdf",
        "tolovlar-hisoboti.pdf",
      );
    } catch {
      toast.error("PDF yuklab olishda xatolik");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
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
        block
        loading={downloading}
        iconBefore={<DownloadSimple weight="bold" />}
        onClick={download}
      >
        PDF yuklab olish
      </Button>
    </Card>
  );
}
