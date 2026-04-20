"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScanLine, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { studentNavItems } from "@/lib/student-nav-items";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { QrScanDialog } from "./qr-scan-dialog";

export function StudentSidebar() {
  const pathname = usePathname();
  const [qrOpen, setQrOpen] = useState(false);
  const aiActive = pathname.startsWith("/portal/ai");

  function isActive(url: string) {
    if (url === "/portal") return pathname === "/portal";
    return pathname.startsWith(url);
  }

  return (
    <>
      <aside className="hidden md:flex sticky top-0 h-screen w-64 shrink-0 flex-col border-r border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-16 items-center px-5 border-b border-border">
          <Link
            href="/portal"
            className="portal-heading text-xl font-medium tracking-tight"
          >
            Talaba portali
          </Link>
        </div>

        <div className="px-3 pt-4">
          <Link
            href="/portal/ai"
            className={cn(
              "group relative block w-full overflow-hidden rounded-xl border bg-linear-to-br from-primary/10 via-background to-primary/5 px-3.5 py-3 text-left transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              aiActive
                ? "border-primary/50 shadow-sm"
                : "border-primary/20 hover:border-primary/40",
            )}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-primary/15 blur-2xl transition-opacity group-hover:opacity-80"
            />
            <div className="relative flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="portal-heading text-sm font-medium leading-tight">
                  Deutsch Tutor
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  AI yordamchi
                </p>
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 pt-4 pb-5">
          <ul className="flex flex-col gap-1">
            {studentNavItems
              .filter((item) => item.url !== "/portal/ai")
              .map((item) => {
                const active = isActive(item.url);
                const Icon = item.icon;
                return (
                  <li key={item.url}>
                    <Link
                      href={item.url}
                      className={cn(
                        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        active
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary"
                        />
                      )}
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-primary" : "",
                        )}
                      />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </nav>

        <div className="border-t border-border p-3 flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setQrOpen(true)}
                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <ScanLine className="size-4" />
                QR Skaner
              </button>
            </TooltipTrigger>
            <TooltipContent>QR skaner orqali davomat</TooltipContent>
          </Tooltip>
          <ThemeToggle />
        </div>
      </aside>

      <QrScanDialog open={qrOpen} onOpenChange={setQrOpen} />
    </>
  );
}
