import { cn } from "@/lib/utils";

/** One figure of the managers' views («Barchasi», «Yuklama»); `tone` colours the value. */
export function TaskTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}
