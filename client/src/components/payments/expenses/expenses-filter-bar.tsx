"use client";

import { useCallback, useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { UrlSearchBox } from "@/components/payments/debt/debt-filter-bar";
import { categoryLabel, EXPENSE_CATEGORIES } from "./expenses-labels";
import { cleanKim, cleanTurkum, cleanUsul, EXPENSES_CLEARED, hasExpenseFilter, type ExpensesFilters } from "./expenses-url";
import type { ExpenseCreator } from "./expenses-types";

// The bold count and amount sit inside a sentence the dictionary translates whole: markers go where they are, the line is split on them.
const COUNT_MARK = "\u0001";
const AMOUNT_MARK = "\u0002";

// Both methods together = no filter, so one choice (client/CLAUDE.md «Filter Bars»).
const USUL_OPTIONS = [
  { value: "all", label: msg("Naqd va karta") },
  { value: "naqd", label: msg("Naqd") },
  { value: "karta", label: msg("Karta") },
];

/** Every filter change puts the table back on page 1 (the URL helper does not). */
export const firstPage = (onChange: (u: Partial<ExpensesFilters>) => void) => (u: Partial<ExpensesFilters>) => onChange({ ...u, sahifa: 1 });

/** «Tanlangan: N ta · X so'm», the count and the amount in bold (spec B6 §3.5). */
function SelectedLine({ count, amount }: { count: number; amount: number }) {
  const t = useT();
  const parts = t("Tanlangan: {count} · {amount}", { count: COUNT_MARK, amount: AMOUNT_MARK }).split(/([\u0001\u0002])/);
  const bold = (text: string) => <b className="tabular-nums text-foreground">{text}</b>;
  return (
    <p className="text-sm text-muted-foreground">
      {parts.map((part, i) =>
        part === COUNT_MARK ? <span key={i}>{bold(t("{n} ta", { n: formatNumber(count) }))}</span>
        : part === AMOUNT_MARK ? <span key={i}>{bold(`${formatPrice(amount)} ${t("so'm")}`)}</span>
        : part)}
    </p>
  );
}

/** Search, category, method, «Kim kiritgan», «Tozalash» and «Tanlangan» (spec B6 §3.5). */
export function ExpensesFilterBar({ filters, creators, selection, onChange }: {
  filters: ExpensesFilters;
  /** The month's authors, from `month-summary`. */
  creators: ExpenseCreator[];
  /** The list's `total` and `summary.totalAmount`; null while there is no settled answer. */
  selection: { count: number; amount: number } | null;
  onChange: (u: Partial<ExpensesFilters>) => void;
}) {
  const t = useT();
  const categoryOptions: MultiSelectOption[] = EXPENSE_CATEGORIES.map((value) => ({ value, label: categoryLabel(value, t) }));
  const change = useMemo(() => firstPage(onChange), [onChange]);
  const onSearch = useCallback((q: string) => change({ q }), [change]);
  const usul = cleanUsul(filters.usul) || "all";
  const usulLabel = USUL_OPTIONS.find((o) => o.value === usul)?.label ?? "";
  const creatorOptions: MultiSelectOption[] = creators.map((c) => ({
    value: String(c.id),
    label: `${c.firstName} ${c.lastName}`.trim(),
    initials: `${c.firstName.charAt(0)}${c.lastName.charAt(0)}`,
  }));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <UrlSearchBox value={filters.q} onSearch={onSearch} label={t("Qidiruv")} placeholder={t("Tavsif bo'yicha qidirish")} className="sm:w-64" />
        <MultiSelectCombobox options={categoryOptions} selected={cleanTurkum(filters.turkum)} onChange={(turkum) => change({ turkum })}
          placeholder={t("Barcha turkumlar")} searchPlaceholder={t("Turkum qidirish...")} className="w-auto min-w-[160px]" />
        <Select value={usul} onValueChange={(v) => change({ usul: v === "all" ? "" : v })}>
          <SelectTrigger className="w-full sm:w-40" aria-label={t("To'lov turi")}>
            <SelectValue>{t(usulLabel)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {USUL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MultiSelectCombobox options={creatorOptions} selected={cleanKim(filters.kim)} onChange={(kim) => change({ kim })}
          placeholder={t("Kim kiritgan: hammasi")} searchPlaceholder={t("Ism qidirish...")} className="w-auto min-w-[180px]" />
        {hasExpenseFilter(filters) && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => change(EXPENSES_CLEARED)}>
            <X className="mr-1 size-4" />
            {t("Tozalash")}
          </Button>
        )}
      </div>
      {selection && <SelectedLine count={selection.count} amount={selection.amount} />}
    </div>
  );
}
