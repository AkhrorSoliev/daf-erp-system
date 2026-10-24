"use client";

import Link from "next/link";
import { ChevronRight, LifeBuoy, BookOpen } from "lucide-react";
import { NavItemBadge } from "@/components/nav-item-badge";
import { COMPANY } from "@/lib/company";
import { useT } from "@/i18n/context";

/**
 * «Qo'llanma» and «Texnik yordam» for a teacher on a phone. They used to sit
 * in the side menu, which a teacher no longer has: the bottom bar holds the
 * five sections and this page holds the rest.
 */
export function TeacherProfileLinks() {
  const t = useT();
  const row = "flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50";
  return (
    <ul className="bg-card divide-y rounded-lg border">
      <li>
        <Link href="/qollanma" className={row}>
          <BookOpen className="text-muted-foreground size-4" aria-hidden />
          <span className="flex-1">{t("Qo'llanma")}</span>
          <NavItemBadge badgeKey="qollanma-yangiliklar" />
          <ChevronRight className="text-muted-foreground size-4" aria-hidden />
        </Link>
      </li>
      <li>
        <a href={COMPANY.supportHref} target="_blank" rel="noopener noreferrer" className={row}>
          <LifeBuoy className="text-muted-foreground size-4" aria-hidden />
          <span className="flex-1">{t("Texnik yordam")}</span>
          <ChevronRight className="text-muted-foreground size-4" aria-hidden />
        </a>
      </li>
    </ul>
  );
}
