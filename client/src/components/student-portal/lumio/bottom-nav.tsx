"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { bottomNavItems, moreRoutes } from "@/lib/student-nav-items";

// Floating glass bottom-nav pill — mobile + tablet only (hidden at lg). The AI
// item renders as a raised coral FAB; other active tabs turn coral. Geometry
// mirrors the student-app LumioTabBar (68px pill, 34px radius).
export function LumioBottomNav({ className }: { className?: string }) {
  const pathname = usePathname();

  function isActive(url: string) {
    if (url === "/portal") return pathname === "/portal";
    if (url === "/portal/more") {
      return moreRoutes.some((r) => pathname.startsWith(r));
    }
    return pathname.startsWith(url);
  }

  return (
    <nav
      className={cn(
        "fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+14px)] z-50",
        className,
      )}
      aria-label="Asosiy navigatsiya"
    >
      <div className="glass mx-auto flex h-[68px] max-w-[520px] items-center justify-around rounded-[34px] border border-line/70 bg-surface/85 px-2 shadow-lumio-pop">
        {bottomNavItems.map((item) => {
          const active = isActive(item.url);
          const Icon = item.icon;

          if (item.raised) {
            return (
              <Link
                key={item.url}
                href={item.url}
                aria-label={item.title}
                aria-current={active ? "page" : undefined}
                className="relative flex min-w-14 flex-col items-center"
              >
                <span
                  className={cn(
                    "-mt-7 flex size-14 items-center justify-center rounded-full bg-coral-500 text-white ring-4 ring-surface transition-transform clay-coral",
                    active ? "scale-105" : "hover:scale-105",
                  )}
                >
                  <Icon size={26} weight={active ? "fill" : "bold"} />
                </span>
                <span
                  className={cn(
                    "mt-1 text-[11px] font-bold leading-none",
                    active ? "text-coral-600" : "text-ink-400",
                  )}
                >
                  {item.title}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.url}
              href={item.url}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-2xl transition-colors",
                active ? "text-coral-600" : "text-ink-400 hover:text-ink-700",
              )}
            >
              <Icon size={24} weight={active ? "fill" : "regular"} />
              <span
                className={cn(
                  "text-[11px] leading-none",
                  active ? "font-extrabold" : "font-bold",
                )}
              >
                {item.title}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
