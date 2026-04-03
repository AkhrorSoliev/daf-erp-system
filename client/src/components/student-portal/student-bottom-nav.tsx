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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden">
      <div
        className="flex items-center justify-around"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 4px)" }}
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
                className="flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-h-13 min-w-15"
              >
                <div
                  className={cn(
                    "size-9 rounded-full flex items-center justify-center transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/10 text-primary dark:bg-primary/20"
                  )}
                >
                  <Icon className="size-4.5" />
                </div>
                <span
                  className={cn(
                    "text-[10px] leading-tight text-primary",
                    active ? "font-semibold" : "font-medium"
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
                "flex flex-col items-center justify-center gap-0.5 py-2.5 px-3 min-h-13 min-w-15",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("size-5", active && "stroke-[2.5px]")} />
              <span
                className={cn(
                  "text-[10px] leading-tight",
                  active ? "font-semibold" : "font-medium"
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
