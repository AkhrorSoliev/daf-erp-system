"use client";

import { cn } from "@/lib/utils";
import { NO_SOURCE_TOKEN, type SubmissionSourceCount } from "./types";

interface Props {
  sources: SubmissionSourceCount[];
  value: string[];
  onChange: (next: string[]) => void;
}

/** «Instagram 30 · Telegram 12» — qaysi havola ishlagani, va bir vaqtda manba filtri. */
export function SourceBreakdown({ sources, value, onChange }: Props) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <span className="mr-1 text-muted-foreground">Manba:</span>
      {sources.map((source) => {
        const token = source.id ?? NO_SOURCE_TOKEN;
        const active = value.includes(token);
        return (
          <button
            key={token}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(active ? value.filter((v) => v !== token) : [...value, token])
            }
            className={cn(
              "rounded px-1.5 py-0.5 transition-colors",
              active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
            )}
          >
            {source.name ?? "Belgilanmagan"}{" "}
            <span className="tabular-nums text-muted-foreground">{source.count}</span>
          </button>
        );
      })}
    </div>
  );
}
