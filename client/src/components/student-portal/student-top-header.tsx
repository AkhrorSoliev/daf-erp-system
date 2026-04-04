"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { studentNavItems } from "@/lib/student-nav-items";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { QrScanDialog } from "./qr-scan-dialog";

export function StudentTopHeader() {
  const pathname = usePathname();
  const [qrOpen, setQrOpen] = useState(false);

  function isActive(url: string) {
    if (url === "/portal") return pathname === "/portal";
    return pathname.startsWith(url);
  }

  return (
    <>
      <header className="hidden md:block border-b border-border bg-background">
        <div className="flex h-14 items-center gap-4 px-4">
          <span className="text-sm font-semibold">Talaba portali</span>

          <Separator orientation="vertical" className="h-6" />

          <nav className="flex items-center gap-1">
            {studentNavItems.map((item) => {
              const active = isActive(item.url);
              const Icon = item.icon;
              return (
                <Link
                  key={item.url}
                  href={item.url}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="size-4" />
                  {item.title}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQrOpen(true)}
              className="gap-2"
            >
              <ScanLine className="size-4" />
              QR Skaner
            </Button>
          </div>
        </div>
      </header>

      <QrScanDialog open={qrOpen} onOpenChange={setQrOpen} />
    </>
  );
}
