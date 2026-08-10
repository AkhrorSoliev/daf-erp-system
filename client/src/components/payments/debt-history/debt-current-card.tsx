"use client";

import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
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
} from "./types";

/**
 * The page's headline: how much is owed right now and by whom.
 *
 * The status split is not decoration — 56% of the money sits with students who
 * have left or frozen, and the odds of collecting it differ completely from the
 * active roster's. It doubles as the page filter so the reader can look at one
 * slice without leaving the page.
 */

interface Props {
  data: DebtHistoryResponse | undefined;
  isLoading: boolean;
  statusFilter: DebtStatusFilter;
  onStatusFilterChange: (next: DebtStatusFilter) => void;
}

export function DebtCurrentCard({
  data,
  isLoading,
  statusFilter,
  onStatusFilterChange,
}: Props) {
  if (isLoading || !data) {
    return <Skeleton className="h-56 w-full" />;
  }

  const { current } = data;
  const total = current.byStatus.reduce((s, x) => s + x.amount, 0);

  return (
    <Card className="p-6">
      {/* ── Asosiy raqam ── */}
      <div>
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="inline-flex items-center gap-1">
                Hozirgi qarz
                <Info className="size-3.5" />
              </TooltipTrigger>
              {/* Answers the question the label itself provokes: "which month
                  is this?" It is none — a point-in-time figure that happens to
                  equal the last table row because that month is still open. */}
              <TooltipContent className="max-w-72">
                Bugungi kunda o&apos;quvchilarda jami qancha qarz borligi. Bu
                oylik hisob emas — ertaga boshqacha bo&apos;ladi. Pastdagi
                jadvalning oxirgi qatori bilan bir xil, chunki joriy oy hali
                tugamagan.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {statusFilter !== "all" && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {statusFilter === "active" ? "faol o'quvchilar" : "nofaollar"}
            </span>
          )}
        </p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
          {formatPrice(current.debt)}
          <span className="ml-2 text-lg font-normal text-muted-foreground">
            so&apos;m
          </span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {current.debtorCount} ta o&apos;quvchida
        </p>
      </div>

      {/* ── Tarkibi: bosiladigan kartalar ── */}
      {current.byStatus.length > 0 && (
        <div className="mt-6 space-y-3 border-t pt-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Kimning qarzi</p>
            <p className="text-xs text-muted-foreground">
              Kartani bosing — sahifadagi hamma raqam o&apos;shanga
              moslashadi
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatusTile
              label="Hammasi"
              color="#64748b"
              amount={total}
              count={current.byStatus.reduce((s, x) => s + x.count, 0)}
              share={100}
              selected={statusFilter === "all"}
              hint="Barcha qarzdorlar — hozir o'qiyotgani ham, ketgani ham."
              onClick={() => onStatusFilterChange("all")}
            />
            {current.byStatus.map((s) => {
              const target: DebtStatusFilter =
                s.status === "ACTIVE" ? "active" : "inactive";
              return (
                <StatusTile
                  key={s.status}
                  label={s.label}
                  color={STATUS_COLORS[s.status] ?? "#94a3b8"}
                  amount={s.amount}
                  count={s.count}
                  share={s.share}
                  selected={statusFilter === target}
                  hint={STATUS_HINTS[s.status]}
                  onClick={() =>
                    onStatusFilterChange(
                      statusFilter === target ? "all" : target,
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function StatusTile({
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
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
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
        <TooltipContent className="max-w-56">{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
