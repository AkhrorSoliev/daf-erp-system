"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CEFR_LEVELS } from "@/lib/mock-exam-levels";

interface LevelMultiSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/**
 * Admin picks the CEFR levels a mock exam offers (A1..C2). The participant
 * later chooses exactly one of these in the Telegram bot. Selection is kept
 * in canonical order regardless of click order.
 */
export function LevelMultiSelect({
  value,
  onChange,
  disabled,
}: LevelMultiSelectProps) {
  // Guard against an undefined value (e.g. a form reset that omits the
  // field) so a bad prop can never crash the whole page.
  const selected = value ?? [];
  const toggle = (lvl: string) => {
    const set = new Set(selected);
    if (set.has(lvl)) set.delete(lvl);
    else set.add(lvl);
    onChange(CEFR_LEVELS.filter((l) => set.has(l)));
  };

  return (
    <div className="flex flex-wrap gap-2">
      {CEFR_LEVELS.map((lvl) => {
        const active = selected.includes(lvl);
        return (
          <Button
            key={lvl}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            onClick={() => toggle(lvl)}
            disabled={disabled}
            className={cn("w-14 tabular-nums", active && "ring-2 ring-primary/40")}
          >
            {lvl}
          </Button>
        );
      })}
    </div>
  );
}
