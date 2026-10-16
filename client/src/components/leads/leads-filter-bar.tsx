"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import {
  MultiSelectCombobox,
  type MultiSelectOption,
} from "@/components/ui/multi-select-combobox";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import {
  LEAD_FILTER_SCHEMA,
  LEAD_HOLATI_GROUPS,
  LEAD_HOLATI_OPTIONS,
  leadDateFieldIsConversion,
  leadFiltersActive,
} from "./lead-filter-schema";
import { LEAD_STATS_SCHEMA, parseStatsPeriod } from "./lead-stats";
import { fetchOwnerSummary } from "./ownership/ownership-api";

/** A source option for the filter — includes soft-deleted-but-used ones. */
interface FilterSource {
  id: string;
  name: string;
  deleted: boolean;
}

/**
 * Variantlar guruh tartibida tekislanadi — `MultiSelectCombobox` sarlavhani
 * guruh o'zgargan joyda chizadi, shuning uchun tartib muhim.
 */
const HOLATI_OPTIONS: MultiSelectOption[] = LEAD_HOLATI_GROUPS.flatMap(
  (group) =>
    LEAD_HOLATI_OPTIONS.filter((o) => o.group === group).map((o) => ({
      value: o.value,
      label: o.label,
      group,
    })),
);

export function LeadsFilterBar() {
  const { filters, setFilters, resetFilters } =
    useUrlFilters(LEAD_FILTER_SCHEMA);
  const columns = useLeadsBoard((s) => s.board);

  const [sources, setSources] = useState<FilterSource[]>([]);
  const [searchInput, setSearchInput] = useState(filters.search);

  // People who hold or took leads in the strip's period: the «Mas'ul» options.
  const { filters: statsFilters } = useUrlFilters(LEAD_STATS_SCHEMA);
  const period = parseStatsPeriod(statsFilters.period);
  const branchId = useBranchSwitcher((s) => s.selectedBranch?.id ?? "all");
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const { data: owners } = useQuery({
    queryKey: ["leads", "owners", branchId, period],
    queryFn: () => fetchOwnerSummary(period),
    enabled: branchLoaded,
  });
  const ownerOptions: MultiSelectOption[] = [
    { value: "me", label: "Meniki" },
    { value: "none", label: "Egasiz" },
    ...(owners?.rows ?? []).map((r) => ({
      value: String(r.userId),
      label: r.name,
    })),
  ];

  useEffect(() => {
    api
      .get<FilterSource[]>("/lead-sources/filter")
      .then(({ data }) => setSources(data))
      .catch(() => {});
  }, []);

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setFilters({ search: value, page: 1 });
  }, 300);

  const startDate = filters.startDate ? parseISO(filters.startDate) : null;
  const endDate = filters.endDate ? parseISO(filters.endDate) : null;

  // Sana tanlagichlarining yorlig'i qaysi sana filtrlanayotganini aytib tursin.
  const dateLabel = leadDateFieldIsConversion(filters.holati)
    ? "Aylangan sana"
    : "Sana";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-auto">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Ism yoki telefon bo'yicha qidirish..."
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            debouncedSearch(e.target.value);
          }}
          className="w-full pl-9 sm:w-64"
        />
      </div>

      <MultiSelectCombobox
        options={HOLATI_OPTIONS}
        selected={filters.holati}
        onChange={(next) => setFilters({ holati: next, page: 1 })}
        placeholder="Barcha holatlar"
        searchPlaceholder="Holat qidirish..."
        className="w-full sm:w-56"
      />

      <MultiSelectCombobox
        options={sources.map((x) => ({
          value: x.id,
          label: `${x.name}${x.deleted ? " (o'chirilgan)" : ""}`,
        }))}
        selected={filters.sourceId}
        onChange={(next) => setFilters({ sourceId: next, page: 1 })}
        placeholder="Barcha manbalar"
        searchPlaceholder="Manba qidirish..."
        className="w-full sm:w-48"
      />

      <MultiSelectCombobox
        options={columns.map((x) => ({ value: x.id, label: x.name }))}
        selected={filters.columnId}
        onChange={(next) => setFilters({ columnId: next, page: 1 })}
        placeholder="Barcha ustunlar"
        searchPlaceholder="Ustun qidirish..."
        className="w-full sm:w-48"
      />

      <MultiSelectCombobox
        options={ownerOptions}
        selected={filters.masul}
        onChange={(next) => setFilters({ masul: next, page: 1 })}
        placeholder="Barcha mas'ullar"
        searchPlaceholder="Xodim qidirish..."
        className="w-full sm:w-48"
      />

      <DatePicker
        value={startDate}
        placeholder={`${dateLabel}: boshi`}
        maxDate={endDate ?? undefined}
        defaultMonth={endDate ?? undefined}
        onChange={(d) =>
          setFilters({ startDate: d ? format(d, "yyyy-MM-dd") : "", page: 1 })
        }
        className="w-full sm:w-40"
      />
      <DatePicker
        value={endDate}
        placeholder={`${dateLabel}: oxiri`}
        minDate={startDate ?? undefined}
        defaultMonth={startDate ?? undefined}
        onChange={(d) =>
          setFilters({ endDate: d ? format(d, "yyyy-MM-dd") : "", page: 1 })
        }
        className="w-full sm:w-40"
      />

      {leadFiltersActive(filters) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput("");
                resetFilters();
              }}
            >
              <X className="mr-1 size-4" />
              Tozalash
            </Button>
          </TooltipTrigger>
          <TooltipContent>Barcha filtrlarni tozalash</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
