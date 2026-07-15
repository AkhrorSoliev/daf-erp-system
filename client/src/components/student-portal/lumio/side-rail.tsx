"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Lightning,
  Sparkle,
  QrCode,
  CaretRight,
} from "@phosphor-icons/react";
import { railNavItems, moreRoutes } from "@/lib/student-nav-items";
import { useStudentProfile } from "../lib/queries";
import { QrScanDialog } from "../qr-scan-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "./avatar";
import { LogoutButton } from "../student-logout-button";

// Desktop side rail (>= lg). Full portal menu expanded: profile summary, the AI
// Deutsch Tutor feature card, the nav list, and a footer with QR / theme /
// logout. Replaces the mobile bottom nav on wide screens.
export function LumioSideRail({ className }: { className?: string }) {
  const pathname = usePathname();
  const [qrOpen, setQrOpen] = useState(false);
  const { data: profile } = useStudentProfile();
  const aiActive = pathname.startsWith("/portal/ai");

  function isActive(url: string) {
    if (url === "/portal") return pathname === "/portal";
    if (url === "/portal/more") {
      return moreRoutes.some((r) => pathname.startsWith(r));
    }
    return pathname.startsWith(url);
  }

  return (
    <>
      <aside
        className={cn(
          "glass fixed inset-y-0 left-0 z-40 w-[240px] flex-col border-r border-line bg-surface/85",
          className,
        )}
      >
        {/* Brand */}
        <Link
          href="/portal"
          className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-5"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-coral-500 text-white clay-coral">
            <Lightning size={18} weight="fill" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight text-ink-900">
            DAF Student
          </span>
        </Link>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          {/* Profile summary */}
          <Link
            href="/portal/profile"
            className={cn(
              "flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 shadow-lumio-sm transition-colors hover:bg-tint",
              pathname.startsWith("/portal/profile") && "border-coral-500/40",
            )}
          >
            <Avatar
              src={profile?.photo}
              name={
                profile
                  ? `${profile.firstName} ${profile.lastName}`
                  : undefined
              }
              size={40}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-sm font-bold text-ink-900">
                {profile
                  ? `${profile.firstName} ${profile.lastName}`.trim()
                  : "Profil"}
              </span>
              <span className="block text-xs font-semibold text-ink-500">
                Profilni ko&apos;rish
              </span>
            </span>
            <CaretRight size={16} weight="bold" className="text-ink-400" />
          </Link>

          {/* AI Deutsch Tutor feature card */}
          <Link
            href="/portal/ai"
            className={cn(
              "grad-grape clay-grape relative overflow-hidden rounded-card p-3.5 text-white transition-transform clay-btn",
              aiActive && "ring-2 ring-grape-500/40",
            )}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-md bg-white/25">
                <Sparkle size={20} weight="fill" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-sm font-extrabold leading-tight">
                  Deutsch Tutor
                </span>
                <span className="block text-[11px] font-semibold text-white/80">
                  AI yordamchi
                </span>
              </span>
            </div>
          </Link>

          {/* Nav */}
          <nav className="flex flex-col gap-1">
            {railNavItems.map((item) => {
              const active = isActive(item.url);
              const Icon = item.icon;
              return (
                <Link
                  key={item.url}
                  href={item.url}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-coral-500/10 font-bold text-coral-600"
                      : "font-semibold text-ink-600 hover:bg-tint hover:text-ink-900",
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-coral-500"
                    />
                  )}
                  <Icon size={20} weight={active ? "fill" : "bold"} />
                  <span className="truncate">{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2 border-t border-line p-3">
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-line bg-surface text-sm font-bold text-teal-600 transition-colors hover:bg-tint"
          >
            <QrCode size={18} weight="bold" />
            QR Skaner
          </button>
          <ThemeToggle />
          <LogoutButton variant="rail" />
        </div>
      </aside>

      <QrScanDialog open={qrOpen} onOpenChange={setQrOpen} />
    </>
  );
}
