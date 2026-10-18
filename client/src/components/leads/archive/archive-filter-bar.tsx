"use client";

import { useCallback } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { UrlSearchBox } from "@/components/payments/debt/debt-filter-bar";
import {
  dateToDay,
  dayToDate,
  hasArchiveFilter,
  type ArchiveFilters,
} from "./archive-url";

/**
 * Qidiruv, «Kim tomonidan» va sana oralig'i. Hammasi URL'da; `onChange` sahifani
 * 1 ga qaytarishni o'zi hal qiladi (shell'dagi `patch`). `onChange` barqaror
 * bo'lmasa qidiruv oynasi yozilayotgan matnni yo'qotmaydi, lekin keraksiz
 * qayta ishga tushadi.
 */
export function ArchiveFilterBar({
  filters,
  archivers,
  onChange,
  onClear,
}: {
  filters: ArchiveFilters;
  archivers: { id: number; name: string }[];
  onChange: (update: Partial<ArchiveFilters>) => void;
  onClear: () => void;
}) {
  const onSearch = useCallback((q: string) => onChange({ q }), [onChange]);
  const from = dayToDate(filters.dan);
  const to = dayToDate(filters.gacha);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <UrlSearchBox
        value={filters.q}
        onSearch={onSearch}
        label="Arxivdan qidirish"
        placeholder="Ism, telefon yoki sabab bo'yicha..."
      />
      <MultiSelectCombobox
        className="w-full sm:w-56"
        options={archivers.map((a) => ({ value: String(a.id), label: a.name }))}
        selected={filters.kim}
        onChange={(kim) => onChange({ kim })}
        placeholder="Barcha xodimlar"
        searchPlaceholder="Xodim qidirish..."
      />
      <DatePicker
        className="w-full sm:w-40"
        value={from}
        onChange={(d) => onChange({ dan: dateToDay(d) })}
        placeholder="Dan"
        maxDate={to}
        defaultMonth={to}
      />
      <DatePicker
        className="w-full sm:w-40"
        value={to}
        onChange={(d) => onChange({ gacha: dateToDay(d) })}
        placeholder="Gacha"
        minDate={from}
        defaultMonth={from}
      />
      {hasArchiveFilter(filters) && (
        <Button variant="ghost" onClick={onClear}>
          <X className="size-4" />
          Tozalash
        </Button>
      )}
    </div>
  );
}
