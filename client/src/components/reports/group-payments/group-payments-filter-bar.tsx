"use client";

import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useT } from "@/i18n/context";
import { UrlSearchBox } from "@/components/payments/debt/debt-filter-bar";
import { KESIM_OPTIONS, TARTIB_OPTIONS } from "./group-payments-format";
import { cleanKesim, cleanTartib, type GroupPaymentsFilters } from "./group-payments-url";

/** The cut, the search, the sort and «Faqat qarzi borlar» (spec B5 §3.4). The page puts the table back on page 1. */
export function GroupPaymentsFilterBar({ filters, onChange }: {
  filters: GroupPaymentsFilters;
  onChange: (u: Partial<GroupPaymentsFilters>) => void;
}) {
  const t = useT();
  const kesim = cleanKesim(filters.kesim);
  const tartib = cleanTartib(filters.tartib);
  const onSearch = useCallback((q: string) => onChange({ q }), [onChange]);
  const sortLabel = TARTIB_OPTIONS.find((o) => o.value === tartib)?.label;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup type="single" variant="outline" value={kesim} onValueChange={(v) => v && onChange({ kesim: v })} aria-label={t("Kesim")}>
        {KESIM_OPTIONS.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className="px-3">
            {t(o.label)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <UrlSearchBox value={filters.q} onSearch={onSearch} label={t("Qidiruv")} placeholder={t("Guruh, ustoz yoki kurs")} />
      <Select value={tartib} onValueChange={(v) => onChange({ tartib: v })}>
        <SelectTrigger className="w-full sm:w-44" aria-label={t("Saralash")}>
          <SelectValue>{sortLabel && t(sortLabel)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TARTIB_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {t(o.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={filters.qarzdor === "1"} onCheckedChange={(v) => onChange({ qarzdor: v === true ? "1" : "" })} />
        {t("Faqat qarzi borlar")}
      </label>
    </div>
  );
}
