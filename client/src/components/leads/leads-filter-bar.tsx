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
import { leadColumnName, useLeadsBoard } from "@/hooks/use-leads-board";
import {
  CLEARED_LEAD_FILTERS,
  LEAD_FILTER_SCHEMA,
  LEAD_HOLATI_GROUPS,
  LEAD_HOLATI_OPTIONS,
  leadDateFieldIsConversion,
  leadFiltersActive,
} from "./lead-filter-schema";
import { LEAD_STATS_SCHEMA, parseStatsPeriod } from "./lead-stats";
import { fetchOwnerSummary } from "./ownership/ownership-api";
import { useT } from "@/i18n/context";

/** A source option for the filter — includes soft-deleted-but-used ones. */
interface FilterSource {
  id: string;
  name: string;
  deleted: boolean;
}

export function LeadsFilterBar() {
  const t = useT();
  const { filters, setFilters } = useUrlFilters(LEAD_FILTER_SCHEMA);
  const columns = useLeadsBoard((s) => s.board);
  // Bumped by lead and source changes; a renamed or deleted source must reach
  // the «Manba» options too.
  const revision = useLeadsBoard((s) => s.revision);

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
    { value: "me", label: t("Meniki") },
    { value: "none", label: t("Egasiz") },
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
  }, [revision]);

  // The last search this box wrote to the URL. router.replace lands later than
  // the write, so the box follows `filters.search` only when it CHANGES to
  // something this box did not write (a stats card, «Tozalash», Back). Comparing
  // on every render wiped the typed text while the URL still held the old value.
  const [writtenSearch, setWrittenSearch] = useState(filters.search);
  const [seenSearch, setSeenSearch] = useState(filters.search);
  if (filters.search !== seenSearch) {
    setSeenSearch(filters.search);
    if (filters.search !== writtenSearch) {
      setWrittenSearch(filters.search);
      setSearchInput(filters.search);
    }
  }

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setWrittenSearch(value);
    setFilters({ search: value, page: 1 });
  }, 300);

  const startDate = filters.startDate ? parseISO(filters.startDate) : null;
  const endDate = filters.endDate ? parseISO(filters.endDate) : null;

  // Sana tanlagichlarining yorlig'i qaysi sana filtrlanayotganini aytib tursin.
  const byConversion = leadDateFieldIsConversion(filters.holati);

  // Variantlar guruh tartibida tekislanadi — `MultiSelectCombobox` sarlavhani
  // guruh o'zgargan joyda chizadi, shuning uchun tartib muhim.
  const holatiOptions: MultiSelectOption[] = LEAD_HOLATI_GROUPS.flatMap((group) =>
    LEAD_HOLATI_OPTIONS.filter((o) => o.group === group).map((o) => ({
      value: o.value,
      label: t(o.label),
      group: t(group),
    })),
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-auto">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("Ism yoki telefon bo'yicha qidirish...")}
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            debouncedSearch(e.target.value);
          }}
          className="w-full pl-9 sm:w-64"
        />
      </div>

      <MultiSelectCombobox
        options={holatiOptions}
        selected={filters.holati}
        onChange={(next) => setFilters({ holati: next, page: 1 })}
        placeholder={t("Barcha holatlar")}
        searchPlaceholder={t("Holat qidirish...")}
        className="w-full sm:w-56"
      />

      <MultiSelectCombobox
        options={sources.map((x) => ({
          value: x.id,
          label: x.deleted
            ? t("{name} (o'chirilgan)", { name: x.name })
            : x.name,
        }))}
        selected={filters.sourceId}
        onChange={(next) => setFilters({ sourceId: next, page: 1 })}
        placeholder={t("Barcha manbalar")}
        searchPlaceholder={t("Manba qidirish...")}
        className="w-full sm:w-48"
      />

      <MultiSelectCombobox
        options={columns.map((x) => ({ value: x.id, label: leadColumnName(x, t) }))}
        selected={filters.columnId}
        onChange={(next) => setFilters({ columnId: next, page: 1 })}
        placeholder={t("Barcha ustunlar")}
        searchPlaceholder={t("Ustun qidirish...")}
        className="w-full sm:w-48"
      />

      <MultiSelectCombobox
        options={ownerOptions}
        selected={filters.masul}
        onChange={(next) => setFilters({ masul: next, page: 1 })}
        placeholder={t("Barcha mas'ullar")}
        searchPlaceholder={t("Xodim qidirish...")}
        className="w-full sm:w-48"
      />

      <DatePicker
        value={startDate}
        placeholder={
          byConversion ? t("Aylangan sana: boshi") : t("Sana: boshi")
        }
        maxDate={endDate ?? undefined}
        defaultMonth={endDate ?? undefined}
        onChange={(d) =>
          setFilters({ startDate: d ? format(d, "yyyy-MM-dd") : "", page: 1 })
        }
        className="w-full sm:w-40"
      />
      <DatePicker
        value={endDate}
        placeholder={
          byConversion ? t("Aylangan sana: oxiri") : t("Sana: oxiri")
        }
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
              onClick={() => setFilters(CLEARED_LEAD_FILTERS)}
            >
              <X className="mr-1 size-4" />
              {t("Tozalash")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("Barcha filtrlarni tozalash")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
