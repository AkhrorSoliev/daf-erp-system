"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Lightning, QrCode } from "@phosphor-icons/react";
import { QrScanDialog } from "../qr-scan-dialog";

// Slim frosted-glass top bar for mobile + tablet (hidden at lg — desktop uses
// the side rail). Brand on the left, QR attendance quick-access on the right.
export function LumioTopHeader({ className }: { className?: string }) {
  const [qrOpen, setQrOpen] = useState(false);
  return (
    <>
      <header
        className={cn(
          "glass sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line/70 bg-surface/80 px-4 pt-[env(safe-area-inset-top)]",
          className,
        )}
      >
        <Link href="/portal" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-coral-500 text-white clay-coral">
            <Lightning size={18} weight="fill" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight text-ink-900">
            DAF Student
          </span>
        </Link>

        <button
          type="button"
          onClick={() => setQrOpen(true)}
          aria-label="QR skaner orqali davomat"
          className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-teal-600 shadow-lumio-sm transition-colors hover:bg-tint"
        >
          <QrCode size={20} weight="bold" />
        </button>
      </header>

      <QrScanDialog open={qrOpen} onOpenChange={setQrOpen} />
    </>
  );
}
