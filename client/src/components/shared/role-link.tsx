"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { hasAnyRole } from "@/lib/role-access";
import { cn } from "@/lib/utils";

type RoleLinkProps = ComponentPropsWithoutRef<"a"> & {
  href: string;
  /** Sahifani ochadigan rollar — `@/lib/role-access` dagi ro'yxatlardan biri. */
  roles: number[];
  /** Faqat havolaning o'ziga (hover, focus) — havolasiz matnga tushmaydi. */
  linkClassName?: string;
};

/**
 * Sahifaga havola — faqat server u sahifani ochib beradigan rollarga.
 * Qolganlar xuddi shu mazmunni havolasiz ko'radi: 403 ga olib boradigan
 * havola ko'rsatilmaydi (docs/role-access.md, ikki qatlam qoidasi).
 *
 * Qolgan proplar ikkala holatda ham uzatiladi: Radix `asChild` tetigi
 * (masalan, tooltip) o'z hodisalari va ref'ini shu yo'l bilan beradi.
 * Faqat `aria-label` havolasiz holatda tushib qoladi — u havolaning
 * vazifasini aytadi («profilini ochish»), matn esa hech narsani ochmaydi.
 */
export function RoleLink({
  roles,
  href,
  className,
  linkClassName,
  "aria-label": ariaLabel,
  ...rest
}: RoleLinkProps) {
  const allowed = useAuth((s) => hasAnyRole(s.user?.roles, roles));
  if (allowed) {
    return (
      <Link
        href={href}
        className={cn(className, linkClassName)}
        aria-label={ariaLabel}
        {...rest}
      />
    );
  }
  return <span className={className} {...rest} />;
}
