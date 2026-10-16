"use client";

import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UrlSearchBox } from "@/components/payments/debt/debt-filter-bar";
import { KESIM_OPTIONS, TARTIB_OPTIONS } from "./group-payments-format";
import { cleanKesim, cleanTartib, type GroupPaymentsFilters } from "./group-payments-url";

/** The cut, the search, the sort and «Faqat qarzi borlar» (spec B5 §3.4). The page puts the table back on page 1. */
export function GroupPaymentsFilterBar({ filters, onChange }: {
  filters: GroupPaymentsFilters;
  onChange: (u: Partial<GroupPaymentsFilters>) => void;
}) {
  const kesim = cleanKesim(filters.kesim);
  const tartib = cleanTartib(filters.tartib);
  const onSearch = useCallback((q: string) => onChange({ q }), [onChange]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup type="single" variant="outline" value={kesim} onValueChange={(v) => v && onChange({ kesim: v })} aria-label="Kesim">
        {KESIM_OPTIONS.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className="px-3">
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <UrlSearchBox value={filters.q} onSearch={onSearch} label="Qidiruv" placeholder="Guruh, ustoz yoki kurs" />
      <Select value={tartib} onValueChange={(v) => onChange({ tartib: v })}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Saralash">
          <SelectValue>{TARTIB_OPTIONS.find((o) => o.value === tartib)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TARTIB_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={filters.qarzdor === "1"} onCheckedChange={(v) => onChange({ qarzdor: v === true ? "1" : "" })} />
        Faqat qarzi borlar
      </label>
    </div>
  );
}
