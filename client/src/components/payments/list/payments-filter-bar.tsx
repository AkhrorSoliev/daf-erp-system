"use client";

import { useCallback, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UrlSearchBox } from "@/components/payments/debt/debt-filter-bar";
import { METHOD_FILTER, PART_FILTER } from "./payments-format";
import { hasPaymentFilter, moreFiltersCount, type PaymentFilters } from "./payments-url";
import type { PaymentFilterOptions } from "./payments-list-types";

type Option = { value: string; label: string };

export const NIMAGA_OPTIONS: Option[] = [
  { value: "", label: "Nimaga ketdi: hammasi" },
  ...(Object.entries(PART_FILTER) as [string, { label: string }][]).map(([value, p]) => ({ value, label: p.label })),
];
export const MANBA_OPTIONS: Option[] = [
  { value: "", label: "Manba: hammasi" },
  { value: "admin", label: "Admin kiritgan" },
  { value: "onlayn", label: "Onlayn avtomatik" },
];
export const HOLAT_OPTIONS: Option[] = [
  { value: "otgan", label: "Faqat o'tgan to'lovlar" },
  { value: "bekor", label: "Bekor qilinganlar" },
  { value: "hammasi", label: "Hammasi" },
];

/** «Kim qabul qildi»: «Onlayn» and the staff who took the scope's payments. */
export const qabulOptions = (options: PaymentFilterOptions | undefined): Option[] => [
  { value: "onlayn", label: "Onlayn" },
  ...(options?.receivers ?? []).map((u) => ({ value: String(u.id), label: `${u.firstName} ${u.lastName}` })),
];

// The URL keeps a multi-select as one comma list (client/CLAUDE.md).
const toList = (v: string) => v.split(",").filter(Boolean);
const FIELD = "w-full sm:w-48";

function OneSelect({ value, options, onChange, label }: { value: string; options: Option[]; onChange: (v: string) => void; label: string }) {
  const current = options.find((o) => o.value === value) ?? options[0];
  // "" cannot be an item value: the default option travels as "all".
  return (
    <Select value={current.value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger className={FIELD} aria-label={label}>
        <SelectValue>{current.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || "all"} value={o.value || "all"}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The «To'lovlar» filters (spec B4 §3.5): the main row and «Yana filtrlar»
 * (open or closed lives here, not in the URL). `onChange` takes a partial
 * update; the page puts the list back on page 1.
 */
export function PaymentsFilterBar({ filters, options, onChange, onClear, initialMoreOpen = false }: {
  filters: PaymentFilters;
  options: PaymentFilterOptions | undefined;
  onChange: (u: Partial<PaymentFilters>) => void;
  onClear: () => void;
  initialMoreOpen?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(initialMoreOpen);
  const onSearch = useCallback((q: string) => onChange({ q }), [onChange]);
  const more = moreFiltersCount(filters);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <UrlSearchBox value={filters.q} onSearch={onSearch} label="To'lovni qidirish" placeholder="Ism, telefon, ID yoki kvitansiya raqami" className="sm:w-80" />
        <MultiSelectCombobox
          options={METHOD_FILTER}
          selected={toList(filters.usul)}
          onChange={(next) => onChange({ usul: next.join(",") })}
          placeholder="Barcha usullar"
          searchPlaceholder="Usul qidirish..."
          className={FIELD}
        />
        <OneSelect value={filters.nimaga} options={NIMAGA_OPTIONS} onChange={(nimaga) => onChange({ nimaga })} label="Nimaga ketdi" />
        <MultiSelectCombobox
          options={(options?.groups ?? []).map((g) => ({ value: g.id, label: g.name }))}
          selected={toList(filters.guruh)}
          onChange={(next) => onChange({ guruh: next.join(",") })}
          placeholder="Barcha guruhlar"
          searchPlaceholder="Guruh qidirish..."
          className={FIELD}
        />
        <Button variant="outline" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
          <SlidersHorizontal className="mr-2 size-4" />
          {!moreOpen && more > 0 ? `Yana filtrlar · ${more}` : "Yana filtrlar"}
        </Button>
        <Button variant="ghost" onClick={onClear} disabled={!hasPaymentFilter(filters)}>
          Tozalash
        </Button>
      </div>
      {moreOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <MultiSelectCombobox
            options={(options?.teachers ?? []).map((t) => ({ value: String(t.id), label: `${t.firstName} ${t.lastName}` }))}
            selected={toList(filters.ustoz)}
            onChange={(next) => onChange({ ustoz: next.join(",") })}
            placeholder="Barcha ustozlar"
            searchPlaceholder="Ustoz qidirish..."
            className={FIELD}
          />
          <MultiSelectCombobox
            options={(options?.courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
            selected={toList(filters.kurs)}
            onChange={(next) => onChange({ kurs: next.join(",") })}
            placeholder="Barcha kurslar"
            searchPlaceholder="Kurs qidirish..."
            className={FIELD}
          />
          <MultiSelectCombobox
            options={qabulOptions(options)}
            selected={toList(filters.qabul)}
            onChange={(next) => onChange({ qabul: next.join(",") })}
            placeholder="Kim qabul qildi: hammasi"
            searchPlaceholder="Xodim qidirish..."
            className={FIELD}
          />
          <OneSelect value={filters.manba} options={MANBA_OPTIONS} onChange={(manba) => onChange({ manba })} label="Manba" />
          <OneSelect value={filters.holat} options={HOLAT_OPTIONS} onChange={(holat) => onChange({ holat })} label="Holat" />
        </div>
      )}
    </div>
  );
}
