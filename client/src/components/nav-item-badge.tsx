"use client";

import type { NavBadgeKey } from "@/lib/nav-items";
import { QollanmaYangilikBelgisi } from "@/components/qollanma/qollanma-yangilik-belgisi";

export function NavItemBadge({ badgeKey }: { badgeKey: NavBadgeKey }) {
  switch (badgeKey) {
    case "qollanma-yangiliklar":
      return <QollanmaYangilikBelgisi />;
    default:
      return null;
  }
}
