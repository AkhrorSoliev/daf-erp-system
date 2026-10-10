"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { useCan } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permission-keys";
import { cn } from "@/lib/utils";

type CanLinkProps = ComponentPropsWithoutRef<"a"> & {
  href: string;
  /** The capability that opens the page — viewers without it get the text alone. */
  perm: PermissionKey | readonly PermissionKey[];
  /** Only the link itself (hover, focus) — never the plain text. */
  linkClassName?: string;
};

/**
 * A link to a page, only for viewers the server lets open it. Everyone else
 * sees the same content without the link: a link that ends in a 403 is never
 * shown (docs/role-access.md, both layers). The other props go to both forms,
 * so a Radix `asChild` trigger keeps its handlers; `aria-label` belongs to the
 * link alone.
 */
export function CanLink({
  perm,
  href,
  className,
  linkClassName,
  "aria-label": ariaLabel,
  ...rest
}: CanLinkProps) {
  const allowed = useCan(perm);
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
