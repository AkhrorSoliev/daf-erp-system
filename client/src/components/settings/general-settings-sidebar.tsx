"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  {
    title: "Kompaniya ma'lumotlari",
    url: "/settings/general",
    icon: Building2,
  },
];

export function GeneralSettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-52 shrink-0 space-y-0.5">
      {navItems.map((item) => {
        const isActive = pathname === item.url;
        return (
          <Link
            key={item.url}
            href={item.url}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
