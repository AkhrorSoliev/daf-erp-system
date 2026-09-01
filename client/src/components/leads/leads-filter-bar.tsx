"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
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
  leadFiltersActive,
} from "./lead-filter-schema";

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
const HOLATI_OPTIONS: MultiSelectOption[] = LEAD_HOLATI_GROUPS.flatMap((group) =>
  LEAD_HOLATI_OPTIONS.filter((o) => o.group === group).map((o) => ({
    value: o.value,
    label: o.label,
    group,
  })),
);

export function LeadsFilterBar() {
  const { filters, setFilters, resetFilters } = useUrlFilters(
    LEAD_FILTER_SCHEMA,
  );
  const columns = useLeadsBoard((s) => s.board);

  const [sources, setSources] = useState<FilterSource[]>([]);
  const [searchInput, setSearchInput] = useState(filters.search);

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

      <DatePicker
        value={startDate}
        placeholder="Sana: boshi"
        maxDate={endDate ?? undefined}
        defaultMonth={endDate ?? undefined}
        onChange={(d) =>
          setFilters({ startDate: d ? format(d, "yyyy-MM-dd") : "", page: 1 })
        }
        className="w-full sm:w-40"
      />
      <DatePicker
        value={endDate}
        placeholder="Sana: oxiri"
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
