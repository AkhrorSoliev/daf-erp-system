"use client";

import { useState } from "react";
import { ScanLine } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { QrScanDialog } from "./qr-scan-dialog";

export function StudentMobileHeader() {
  const [qrOpen, setQrOpen] = useState(false);

  return (
    <>
      <header className="flex md:hidden items-center justify-between h-14 px-4 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <span className="portal-heading text-lg font-medium tracking-tight">
          Talaba portali
        </span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setQrOpen(true)}
                aria-label="QR skaner"
                className="inline-flex size-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <ScanLine className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>QR skaner orqali davomat</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <QrScanDialog open={qrOpen} onOpenChange={setQrOpen} />
    </>
  );
}
