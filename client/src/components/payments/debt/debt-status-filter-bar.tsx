"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import {
  STATUS_COLORS,
  STATUS_HINTS,
  type DebtHistoryResponse,
  type DebtStatusFilter,
} from "../debt-history/types";

interface Props {
  data: DebtHistoryResponse | undefined;
  isLoading: boolean;
  value: DebtStatusFilter;
  onChange: (next: DebtStatusFilter) => void;
}

/**
 * Whose debt the dynamics table is about: everyone, or one student status.
 *
 * The old page wrapped these tiles under a large "Hozirgi qarz" headline. That
 * headline is not repeated here — it is the "Jami qarz" card one tab away, to
 * the so'm — but the tiles themselves earn their place, because they are the
 * table's filter and they show what each slice is worth while choosing it.
 */
export function DebtStatusFilterBar({
  data,
  isLoading,
  value,
  onChange,
}: Props) {
  if (isLoading || !data) return <Skeleton className="h-20 w-full" />;

  const { byStatus } = data.current;
  if (byStatus.length === 0) return null;

  const total = byStatus.reduce((s, x) => s + x.amount, 0);
  const totalCount = byStatus.reduce((s, x) => s + x.count, 0);

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="Hammasi"
        color="#64748b"
        amount={total}
        count={totalCount}
        share={100}
        selected={value === "all"}
        hint="Barcha qarzdorlar — hozir o'qiyotgani ham, ketgani ham."
        onClick={() => onChange("all")}
      />
      {byStatus.map((s) => {
        const target: DebtStatusFilter =
          s.status === "ACTIVE" ? "active" : "inactive";
        return (
          <Tile
            key={s.status}
            label={s.label}
            color={STATUS_COLORS[s.status] ?? "#94a3b8"}
            amount={s.amount}
            count={s.count}
            share={s.share}
            selected={value === target}
            hint={STATUS_HINTS[s.status]}
            onClick={() => onChange(value === target ? "all" : target)}
          />
        );
      })}
    </div>
  );
}

function Tile({
  label,
  color,
  amount,
  count,
  share,
  selected,
  hint,
  onClick,
}: {
  label: string;
  color: string;
  amount: number;
  count: number;
  share: number;
  selected: boolean;
  hint?: string;
  onClick: () => void;
}) {
  const tile = (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-foreground/30 bg-muted"
          : "hover:border-foreground/20 hover:bg-muted/50",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <span className="mt-1 block text-lg font-semibold tabular-nums">
        {formatPrice(amount)}
      </span>
      <span className="text-xs text-muted-foreground">
        {count} ta · {share}%
      </span>
    </button>
  );
  if (!hint) return tile;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{tile}</TooltipTrigger>
        <TooltipContent className="max-w-64">{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
