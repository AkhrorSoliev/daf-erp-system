"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Plus } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPageHeader } from "./settings-page-header";
import { HolidayRowActions } from "./holiday-row-actions";
import { EditHolidayDrawer } from "./edit-holiday-drawer";
import { useEditHoliday, type Holiday } from "@/hooks/use-edit-holiday";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import api from "@/lib/api";

const holidaysSchema = {
  search: { type: "string" as const, defaultValue: "" },
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 10 },
};

interface ApiHoliday {
  id: string;
  name: string;
  date: string;
  endDate: string;
}

function mapHoliday(h: ApiHoliday): Holiday {
  return { id: h.id, name: h.name, date: h.date, endDate: h.endDate };
}

function formatHolidayRange(holiday: Holiday): string {
  const startStr = format(new Date(holiday.date), "dd.MM.yyyy");
  if (!holiday.endDate || holiday.endDate === holiday.date) {
    return startStr;
  }
  const endStr = format(new Date(holiday.endDate), "dd.MM.yyyy");
  return `${startStr} — ${endStr}`;
}

export function HolidaysSettingsClient() {
  const {
    filters,
    setFilter,
    setFilters: setUrlFilters,
  } = useUrlFilters(holidaysSchema);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const openAddDrawer = useEditHoliday((s) => s.openAddDrawer);

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setUrlFilters({ search: value, page: 1 });
  }, 300);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    debouncedSetSearch(value);
  };

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{
        data: ApiHoliday[];
        total: number;
      }>("/holidays", {
        params: {
          page: filters.page,
          pageSize: filters.pageSize,
          ...(filters.search ? { search: filters.search } : {}),
        },
      });
      setHolidays(data.data.map(mapHoliday));
      setTotal(data.total);
    } catch {
      setHolidays([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters.page, filters.pageSize, filters.search]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const handleSaved = (saved: Holiday) => {
    setHolidays((prev) => {
      const idx = prev.findIndex((h) => h.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return prev;
    });
    fetchHolidays();
  };

  const handleDeleted = (id: string) => {
    setHolidays((prev) => prev.filter((h) => h.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
  };

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Dam olish kunlari"
        description="Rasmiy bayramlar va dam olish kunlarini boshqarish"
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={() => openAddDrawer()}>
                <Plus className="mr-1.5 h-4 w-4" />
                Yangi bayram
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yangi dam olish kuni qo&apos;shish</TooltipContent>
          </Tooltip>
        }
      />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Bayram nomi bo'yicha qidirish..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full sm:max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Bayram nomi</TableHead>
              <TableHead>Sana</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="border-r">
                    <Skeleton className="h-4 w-6" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-6" />
                  </TableCell>
                </TableRow>
              ))
            ) : holidays.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <CalendarOff className="h-8 w-8 text-muted-foreground/50" />
                    {filters.search
                      ? "Qidiruv bo'yicha bayram topilmadi"
                      : "Hali bayram qo'shilmagan — \"Yangi bayram\" tugmasini bosing"}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              holidays.map((holiday, index) => (
                <TableRow key={holiday.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {(filters.page - 1) * filters.pageSize + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">{holiday.name}</TableCell>
                  <TableCell>{formatHolidayRange(holiday)}</TableCell>
                  <TableCell>
                    <HolidayRowActions
                      holiday={holiday}
                      onDeleted={handleDeleted}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Jami: {total} ta bayram
          </p>
          <div className="flex items-center gap-3">
            <Select
              value={String(filters.pageSize)}
              onValueChange={(v) => {
                setUrlFilters({ pageSize: Number(v), page: 1 });
              }}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 40, 50].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page <= 1 || loading}
                onClick={() => setFilter("page", filters.page - 1)}
              >
                Oldingi
              </Button>
              <span className="px-2 text-sm text-muted-foreground">
                {filters.page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page >= totalPages || loading}
                onClick={() => setFilter("page", filters.page + 1)}
              >
                Keyingi
              </Button>
            </div>
          </div>
        </div>
      )}

      <EditHolidayDrawer onSaved={handleSaved} />
    </div>
  );
}
