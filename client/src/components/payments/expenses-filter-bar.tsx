"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  MultiSelectCombobox,
  type MultiSelectOption,
} from "@/components/ui/multi-select-combobox";

// TEACHER_ADVANCE is intentionally absent — advances are created and viewed on
// the Ish haqi (/payments/salary) page, never here.
export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  RENT: "Ijara",
  UTILITIES: "Kommunal",
  SUPPLIES: "Ta'minot",
  MARKETING: "Marketing",
  OTHER: "Boshqa",
};

export const EXPENSE_METHOD_LABELS: Record<string, string> = {
  CASH: "Naqt",
  CARD: "Karta",
};

const CATEGORY_OPTIONS: MultiSelectOption[] = Object.entries(
  EXPENSE_CATEGORY_LABELS,
).map(([value, label]) => ({ value, label }));

const METHOD_OPTIONS: MultiSelectOption[] = Object.entries(
  EXPENSE_METHOD_LABELS,
).map(([value, label]) => ({ value, label }));

interface ExpensesFilterBarProps {
  category: string[];
  paymentMethod: string[];
  searchValue: string;
  startDate: Date | null;
  endDate: Date | null;
  hasActiveFilters: boolean;
  onCategoryChange: (v: string[]) => void;
  onPaymentMethodChange: (v: string[]) => void;
  onSearchChange: (v: string) => void;
  onStartDateChange: (d: Date | null) => void;
  onEndDateChange: (d: Date | null) => void;
  onReset: () => void;
}

export function ExpensesFilterBar({
  category,
  paymentMethod,
  searchValue,
  startDate,
  endDate,
  hasActiveFilters,
  onCategoryChange,
  onPaymentMethodChange,
  onSearchChange,
  onStartDateChange,
  onEndDateChange,
  onReset,
}: ExpensesFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tavsif bo'yicha qidirish..."
          className="pl-9"
        />
      </div>

      <MultiSelectCombobox
        options={CATEGORY_OPTIONS}
        selected={category}
        onChange={onCategoryChange}
        placeholder="Barcha turlar"
        searchPlaceholder="Tur qidirish..."
        className="w-auto min-w-[150px]"
      />

      <MultiSelectCombobox
        options={METHOD_OPTIONS}
        selected={paymentMethod}
        onChange={onPaymentMethodChange}
        placeholder="Barcha to'lov turlari"
        searchPlaceholder="To'lov turi qidirish..."
        className="w-auto min-w-[160px]"
      />

      <div className="flex items-center gap-1">
        <DatePicker
          value={startDate}
          onChange={(d) => onStartDateChange(d ?? null)}
          placeholder="Boshi"
          className="h-9 w-[140px]"
          maxDate={endDate ?? undefined}
          defaultMonth={endDate ?? undefined}
        />
        <span className="text-muted-foreground text-sm">—</span>
        <DatePicker
          value={endDate}
          onChange={(d) => onEndDateChange(d ?? null)}
          placeholder="Oxiri"
          className="h-9 w-[140px]"
          minDate={startDate ?? undefined}
          defaultMonth={startDate ?? undefined}
        />
      </div>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="h-9"
          aria-label="Filtrlarni tozalash"
        >
          <X className="size-4 mr-1" />
          Tozalash
        </Button>
      )}
    </div>
  );
}
