"use client";

import type { ComponentType } from "react";
import type { NavBadgeKey } from "@/lib/nav-items";
import { QollanmaYangilikBelgisi } from "@/components/qollanma/qollanma-yangilik-belgisi";

// Record<NavBadgeKey, …>: yangi kalit qo'shilsa, shu yerda belgi yozilmaguncha tur xato beradi.
const BELGILAR: Record<NavBadgeKey, ComponentType> = {
  "qollanma-yangiliklar": QollanmaYangilikBelgisi,
};

export function NavItemBadge({ badgeKey }: { badgeKey: NavBadgeKey }) {
  const Belgi = BELGILAR[badgeKey];
  return <Belgi />;
}
