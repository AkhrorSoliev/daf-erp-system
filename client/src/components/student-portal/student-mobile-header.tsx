"use client";

import { useState } from "react";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QrScanDialog } from "./qr-scan-dialog";

export function StudentMobileHeader() {
  const [qrOpen, setQrOpen] = useState(false);

  return (
    <>
      <header className="flex md:hidden items-center justify-between h-12 px-4 border-b border-border bg-background">
        <span className="text-sm font-semibold">Talaba portali</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setQrOpen(true)}
        >
          <ScanLine className="size-5" />
        </Button>
      </header>

      <QrScanDialog open={qrOpen} onOpenChange={setQrOpen} />
    </>
  );
}
