"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  STAGE_HINTS,
  STAGE_LABELS,
  SUBMISSION_STAGES,
  type SubmissionStage,
} from "./types";

interface Props {
  counts: Record<SubmissionStage, number>;
  value: SubmissionStage | "";
  onChange: (stage: SubmissionStage | "") => void;
}

/**
 * Yagona holat filtri. Bosqichlar bir-birini qoplamaydi va yig'indisi jami
 * javobga teng, shuning uchun bittasi tanlanadi; qayta bosilsa — hammasi.
 */
export function StageChips({ counts, value, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Bosqich"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      {SUBMISSION_STAGES.map((stage) => {
        const active = value === stage;
        const count = counts[stage];
        return (
          <Tooltip key={stage}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? "" : stage)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                  !active && count === 0 && "text-muted-foreground",
                )}
              >
                {STAGE_LABELS[stage]}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    !active &&
                      stage === "awaiting" &&
                      count > 0 &&
                      "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {count}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{STAGE_HINTS[stage]}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
