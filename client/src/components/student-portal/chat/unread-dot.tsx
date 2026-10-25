"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";

/** Small coral dot (with the count when `count` is given) for the nav. */
export function UnreadDot({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  const t = useT();
  if (count <= 0) return null;
  return (
    <span
      role="img"
      aria-label={t("O'qilmagan xabarlar")}
      data-unread-dot
      className={cn(
        "inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-coral-500",
        className,
      )}
    />
  );
}
