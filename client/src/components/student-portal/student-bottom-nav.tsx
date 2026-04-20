"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { studentNavItems } from "@/lib/student-nav-items";

export function StudentBottomNav() {
  const pathname = usePathname();

  function isActive(url: string) {
    if (url === "/portal") return pathname === "/portal";
    return pathname.startsWith(url);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/90 backdrop-blur-md md:hidden">
      <div
        className="flex items-center justify-around"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 6px)" }}
      >
        {studentNavItems.map((item) => {
          const active = isActive(item.url);
          const Icon = item.icon;
          const isAi = item.url === "/portal/ai";

          if (isAi) {
            return (
              <Link
                key={item.url}
                href={item.url}
                aria-label={item.title}
                className="relative flex flex-col items-center justify-center px-3 min-w-16 -mt-5"
              >
                <div
                  className={cn(
                    "relative size-12 rounded-2xl flex items-center justify-center ring-4 ring-background transition-transform duration-200",
                    "bg-primary text-primary-foreground shadow-sm",
                    active ? "scale-105" : "hover:scale-105",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-5 transition-transform duration-200",
                      active && "scale-110",
                    )}
                  />
                </div>
                <span
                  className={cn(
                    "text-[11px] leading-tight mt-1.5 font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
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
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2.5 px-3 min-h-13 min-w-15 transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-5 transition-transform",
                  active && "stroke-[2.25px]",
                )}
              />
              <span
                className={cn(
                  "text-[11px] leading-tight",
                  active ? "font-semibold" : "font-medium",
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
