"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { tashkentNow } from "@/lib/tashkent-time";

function formatHms(secondsOfDay: number): string {
  const h = Math.floor(secondsOfDay / 3600);
  const m = Math.floor((secondsOfDay % 3600) / 60);
  const s = secondsOfDay % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Always-on Tashkent (UTC+5) clock for the navbar. Lessons, attendance, and
 * payment cycles are validated server-side against Asia/Tashkent — surfacing
 * the same wall-clock here keeps cross-timezone admins (e.g. Berlin/Germany)
 * from second-guessing why a 14:00 lesson feels "in the future" locally but
 * the system says it's already over.
 */
export function TashkentClock() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    setLabel(formatHms(tashkentNow().seconds));
    const interval = setInterval(
      () => setLabel(formatHms(tashkentNow().seconds)),
      1000,
    );
    return () => clearInterval(interval);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="hidden md:flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">
          <Clock className="size-3.5" />
          <span suppressHydrationWarning>{label || "--:--:--"}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>Toshkent vaqti (UTC+5)</TooltipContent>
    </Tooltip>
  );
}
