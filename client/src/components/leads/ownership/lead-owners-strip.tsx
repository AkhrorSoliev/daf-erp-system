"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LEAD_FILTER_SCHEMA } from "../lead-filter-schema";
import {
  LEAD_STATS_PERIODS,
  LEAD_STATS_SCHEMA,
  parseStatsPeriod,
} from "../lead-stats";
import { fetchOwnerSummary, type OwnerSummaryRow } from "./ownership-api";
import { useT } from "@/i18n/context";

// «Bu hafta» → «bu hafta» mid-sentence; only the first letter, so German nouns keep theirs.
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * «Xodimlar bo'yicha» under the stats strip (ADR-0093): one card per person.
 * The big number is how many leads they hold NOW; the three small ones are
 * what happened in the strip's period (taken, taken back by the deadline,
 * became students). A click lists that person's leads; the last card lists the
 * leads nobody holds. A failed request or no one to show hides the strip, the
 * board works without it.
 */
export function LeadOwnersStrip() {
  const t = useT();
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const revision = useLeadsBoard((s) => s.revision);
  const { filters: statsFilters } = useUrlFilters(LEAD_STATS_SCHEMA);
  const { filters, setFilters } = useUrlFilters(LEAD_FILTER_SCHEMA);
  const period = parseStatsPeriod(statsFilters.period);
  const periodItem = LEAD_STATS_PERIODS.find((p) => p.value === period);
  const periodLabel = periodItem ? lowerFirst(t(periodItem.label)) : "";
  // The list shows exactly this owner's leads.
  const active = (value: string) =>
    filters.masul.length === 1 && filters.masul[0] === value;

  const { data, isPending, isError } = useQuery({
    queryKey: ["leads", "owners", selectedBranch?.id ?? "all", period, revision],
    queryFn: () => fetchOwnerSummary(period),
    enabled: branchLoaded,
    placeholderData: (previous) => previous,
  });

  if (isError || (data && data.rows.length === 0 && data.unowned === 0)) {
    return null;
  }

  return (
    <section className="space-y-1.5">
      <div className="flex h-6 items-baseline justify-between gap-2 px-0.5 text-xs text-muted-foreground">
        <span>{t("Xodimlar bo'yicha")}</span>
        <span>
          {t("Davr: {period} · bosing — ro'yxatda shu lidlar chiqadi", {
            period: periodLabel,
          })}
        </span>
      </div>
      <TooltipProvider>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {isPending || !data
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)
            : (
                <>
                  {data.rows.map((r) => (
                    <OwnerCard
                      key={r.userId}
                      row={r}
                      selected={active(String(r.userId))}
                      onSelect={() =>
                        setFilters({ masul: [String(r.userId)], page: 1 })
                      }
                    />
                  ))}
                  {data.unowned > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilters({ masul: ["none"], page: 1 })}
                      aria-pressed={active("none")}
                      className={cn(
                        "rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                        active("none") && "ring-2 ring-primary",
                      )}
                    >
                      <p className="text-sm font-medium">{t("Hech kimda yo'q")}</p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {t("Egasiz lidlar")}
                      </p>
                      <p className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-medium tabular-nums">
                          {formatNumber(data.unowned)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t("ta lid")}
                        </span>
                      </p>
                    </button>
                  )}
                </>
              )}
        </div>
      </TooltipProvider>
    </section>
  );
}

function OwnerCard({
  row,
  selected,
  onSelect,
}: {
  row: OwnerSummaryRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
        selected && "ring-2 ring-primary",
      )}
    >
      <p className="truncate text-sm font-medium">{row.name}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{t("Hozir qo'lida")}</p>
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span className="text-2xl font-medium tabular-nums">
          {formatNumber(row.held)}
        </span>
        <span className="text-xs text-muted-foreground">{t("ta lid")}</span>
        {row.untouched > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="rounded-md bg-yellow-100 px-2 py-0.5 text-[11px] text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200">
                {t("{n} tasiga tegilmagan", { n: formatNumber(row.untouched) })}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t(
                "Qo'ng'iroq, izoh yoki topshiriq hali yo'q. Muddati o'tsa lid umumiy ro'yxatga qaytadi.",
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="mt-2 flex gap-3 border-t pt-2">
        <Metric
          value={row.taken}
          label={t("olgan")}
          hint={t(
            "Shu davrda band qilgan yoki unga berilgan lidlar. Bir lid bir marta sanaladi.",
          )}
        />
        <Metric
          value={row.expired}
          label={t("muddatda qaytgan")}
          warn={row.expired > 0}
          hint={t(
            "Muddatida harakat qilinmagani uchun tizim umumiy ro'yxatga qaytargan lidlar.",
          )}
        />
        <Metric
          value={row.converted}
          label={t("o'quvchi bo'lgan")}
          hint={t("Shu davrda o'quvchiga aylangan lidlari.")}
        />
      </div>
    </button>
  );
}

function Metric({
  value,
  label,
  hint,
  warn,
}: {
  value: number;
  label: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="min-w-0 flex-1">
          <b
            className={cn(
              "block text-base font-medium tabular-nums",
              warn && "text-orange-600 dark:text-orange-400",
            )}
          >
            {formatNumber(value)}
          </b>
          <span className="block text-[11px] leading-tight text-muted-foreground">
            {label}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
