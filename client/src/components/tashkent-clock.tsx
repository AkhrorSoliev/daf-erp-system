"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDdMmYyyy, tashkentNow } from "@/lib/tashkent-time";

function formatHms(secondsOfDay: number): string {
  const h = Math.floor(secondsOfDay / 3600);
  const m = Math.floor((secondsOfDay % 3600) / 60);
  const s = secondsOfDay % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatNow(): { date: string; time: string } {
  const now = tashkentNow();
  return { date: formatDdMmYyyy(now.dateStr), time: formatHms(now.seconds) };
}

/**
 * Always-on Tashkent (UTC+5) clock for the navbar, with the date in front of it
 * from `lg` up (a tablet keeps the time only, so the search box keeps its room).
 * Lessons, attendance, and
 * payment cycles are validated server-side against Asia/Tashkent — surfacing
 * the same wall-clock here keeps cross-timezone admins (e.g. Berlin/Germany)
 * from second-guessing why a 14:00 lesson feels "in the future" locally but
 * the system says it's already over.
 */
export function TashkentClock() {
  const [label, setLabel] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    setLabel(formatNow());
    const interval = setInterval(() => setLabel(formatNow()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="hidden md:flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">
          <Clock className="size-3.5" />
          {/* One text run: the date span and the time sit in a single inline box, so the
              gap between them is a plain space, not the flex gap. */}
          <span suppressHydrationWarning>
            <span className="hidden lg:inline">
              {label ? `${label.date} · ` : "--.--.---- · "}
            </span>
            {label?.time ?? "--:--:--"}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>Toshkent vaqti (UTC+5)</TooltipContent>
    </Tooltip>
  );
}
