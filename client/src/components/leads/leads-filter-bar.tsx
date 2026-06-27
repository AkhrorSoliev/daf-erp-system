"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { useUrlFilters } from "@/hooks/use-url-filters";
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

      <Select
        value={filters.holati}
        onValueChange={(value) => setFilters({ holati: value, page: 1 })}
      >
        <SelectTrigger className="w-full sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Barcha holatlar</SelectItem>
          {LEAD_HOLATI_GROUPS.map((group) => (
            <SelectGroup key={group}>
              <SelectLabel>{group}</SelectLabel>
              {LEAD_HOLATI_OPTIONS.filter((o) => o.group === group).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.sourceId}
        onValueChange={(value) => setFilters({ sourceId: value, page: 1 })}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Barcha manbalar</SelectItem>
          {sources.map((source) => (
            <SelectItem key={source.id} value={source.id}>
              {source.name}
              {source.deleted ? " (o'chirilgan)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.columnId}
        onValueChange={(value) => setFilters({ columnId: value, page: 1 })}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Barcha ustunlar</SelectItem>
          {columns.map((column) => (
            <SelectItem key={column.id} value={column.id}>
              {column.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
