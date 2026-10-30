"use client";

import { Pause, Volume2 } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { useMediaPleyer } from "./media-pleyer";

/** Qatordagi karnay: umumiy playerni boshqaradi, o'z `<audio>`si yo'q. */
export function MediaOvozTugmasi({ id }: { id: string }) {
  const t = useT();
  const joriy = useMediaPleyer((s) => s.joriyId === id);
  const ijroda = useMediaPleyer((s) => s.joriyId === id && s.ijroda);
  const qoyId = useMediaPleyer((s) => s.qoyId);
  const almashtirish = useMediaPleyer((s) => s.almashtirish);
  return (
    <button
      type="button"
      data-pleyer-id={id}
      onClick={() => (joriy ? almashtirish() : qoyId(id))}
      aria-label={ijroda ? t("Pauza") : t("Eshitish")}
      aria-pressed={joriy}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
        joriy ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20",
      )}
    >
      {ijroda ? <Pause className="size-4" /> : <Volume2 className="size-4" />}
    </button>
  );
}
