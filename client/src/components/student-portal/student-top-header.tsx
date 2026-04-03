"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { studentNavItems } from "@/lib/student-nav-items";
import { Separator } from "@/components/ui/separator";

export function StudentTopHeader() {
  const pathname = usePathname();

  function isActive(url: string) {
    if (url === "/portal") return pathname === "/portal";
    return pathname.startsWith(url);
  }

  return (
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
      </div>
    </header>
  );
}
