"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { bottomNavItems, moreRoutes } from "@/lib/student-nav-items";

// Floating glass bottom-nav pill — mobile only (hidden at md, where the side
// rail takes over; the shell passes that class in). Active
// tabs turn coral. Geometry mirrors the student-app LumioTabBar (68px pill,
// 34px radius).
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
