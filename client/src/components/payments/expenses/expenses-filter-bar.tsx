"use client";

import { useCallback } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { UrlSearchBox } from "@/components/payments/debt/debt-filter-bar";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "./expenses-labels";
import { cleanKim, cleanTurkum, cleanUsul, EXPENSES_CLEARED, hasExpenseFilter, type ExpensesFilters } from "./expenses-url";
import type { ExpenseCreator } from "./expenses-types";

const CATEGORY_OPTIONS: MultiSelectOption[] = EXPENSE_CATEGORIES.map((value) => ({ value, label: EXPENSE_CATEGORY_LABELS[value] }));
// Both methods together = no filter, so one choice (client/CLAUDE.md «Filter Bars»).
const USUL_OPTIONS = [
  { value: "all", label: "Naqd va karta" },
  { value: "naqd", label: "Naqd" },
  { value: "karta", label: "Karta" },
];

/** Search, category, method, «Kim kiritgan», «Tozalash» and «Tanlangan» (spec B6 §3.5). */
export function ExpensesFilterBar({ filters, creators, selection, onChange }: {
  filters: ExpensesFilters;
  /** The month's authors, from `month-summary`. */
  creators: ExpenseCreator[];
  /** The list's `total` and `summary.totalAmount`; null while there is no settled answer. */
  selection: { count: number; amount: number } | null;
  onChange: (u: Partial<ExpensesFilters>) => void;
}) {
  // Every filter change puts the table back on page 1 (the URL helper does not).
  const change = useCallback((u: Partial<ExpensesFilters>) => onChange({ ...u, sahifa: 1 }), [onChange]);
  const onSearch = useCallback((q: string) => change({ q }), [change]);
  const usul = cleanUsul(filters.usul) || "all";
  const creatorOptions: MultiSelectOption[] = creators.map((c) => ({
    value: String(c.id),
    label: `${c.firstName} ${c.lastName}`.trim(),
    initials: `${c.firstName.charAt(0)}${c.lastName.charAt(0)}`,
  }));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <UrlSearchBox value={filters.q} onSearch={onSearch} label="Qidiruv" placeholder="Tavsif bo'yicha qidirish" className="sm:w-64" />
        <MultiSelectCombobox options={CATEGORY_OPTIONS} selected={cleanTurkum(filters.turkum)} onChange={(turkum) => change({ turkum })}
          placeholder="Barcha turkumlar" searchPlaceholder="Turkum qidirish..." className="w-auto min-w-[160px]" />
        <Select value={usul} onValueChange={(v) => change({ usul: v === "all" ? "" : v })}>
          <SelectTrigger className="w-full sm:w-40" aria-label="To'lov turi">
            <SelectValue>{USUL_OPTIONS.find((o) => o.value === usul)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {USUL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MultiSelectCombobox options={creatorOptions} selected={cleanKim(filters.kim)} onChange={(kim) => change({ kim })}
          placeholder="Kim kiritgan: hammasi" searchPlaceholder="Ism qidirish..." className="w-auto min-w-[180px]" />
        {hasExpenseFilter(filters) && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => change(EXPENSES_CLEARED)}>
            <X className="mr-1 size-4" />
            Tozalash
          </Button>
        )}
      </div>
      {selection && (
        <p className="text-sm text-muted-foreground">
          Tanlangan: <b className="tabular-nums text-foreground">{formatNumber(selection.count)} ta</b> ·{" "}
          <b className="tabular-nums text-foreground">{formatPrice(selection.amount)} so&apos;m</b>
        </p>
      )}
    </div>
  );
}
