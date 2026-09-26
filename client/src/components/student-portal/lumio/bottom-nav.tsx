"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { bottomNavItems, moreRoutes } from "@/lib/student-nav-items";

// Floating glass bottom-nav pill — mobile only (hidden at md, where the side
// rail takes over; the shell passes that class in). Active
// tabs turn coral. Geometry mirrors the student-app LumioTabBar (68px pill,
// 34px radius). The tabs share the pill equally (`flex-1`): five fixed 56px
// minimums overflowed a 320px phone by 8px, while an equal share there is
// 54px, room for the longest label ("To'lovlar", 45px).
//
// Colours meet WCAG AA for 11px labels (4.5:1) in both themes, measured on
// the pill itself (95% surface over the canvas): inactive ink-600 is 6.5:1
// light / 7.3:1 dark, active coral-700 5.0:1 light and coral-400 6.1:1 dark.
// They still clear 4.5:1 with a coral card scrolled behind the glass, which
// the old 85% pill did not. (Were: ink-400 2.5:1, coral-600 3.5:1.)
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
      <div className="glass mx-auto flex h-[68px] max-w-[520px] items-center justify-around rounded-[34px] border border-line/70 bg-surface/95 px-2 shadow-lumio-pop">
        {bottomNavItems.map((item) => {
          const active = isActive(item.url);
          const Icon = item.icon;

          return (
            <Link
              key={item.url}
              href={item.url}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl transition-colors",
                active
                  ? "text-coral-700 dark:text-coral-400"
                  : "text-ink-600 hover:text-ink-900",
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
