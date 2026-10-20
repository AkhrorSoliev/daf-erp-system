"use client";

import { useCallback, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UrlSearchBox } from "@/components/payments/debt/debt-filter-bar";
import type { Translate } from "@/components/payments/record-payment-admission";
import { paymentMethodLabel } from "@/components/payments/overview/overview-math";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import { METHOD_FILTER, PART_FILTER } from "./payments-format";
import { hasPaymentFilter, moreFiltersCount, type PaymentFilters } from "./payments-url";
import type { PaymentFilterOptions } from "./payments-list-types";

type Option = { value: string; label: string };

// The labels are `msg()` texts: draw them with `t()`.
export const NIMAGA_OPTIONS: Option[] = [
  { value: "", label: msg("Nimaga ketdi: hammasi") },
  ...(Object.entries(PART_FILTER) as [string, { label: string }][]).map(([value, p]) => ({ value, label: p.label })),
];
export const MANBA_OPTIONS: Option[] = [
  { value: "", label: msg("Manba: hammasi") },
  { value: "admin", label: msg("Admin kiritgan") },
  { value: "onlayn", label: msg("Onlayn avtomatik") },
];
export const HOLAT_OPTIONS: Option[] = [
  { value: "otgan", label: msg("Faqat o'tgan to'lovlar") },
  { value: "bekor", label: msg("Bekor qilinganlar") },
  { value: "hammasi", label: msg("Hammasi") },
];

/** «Kim qabul qildi»: «Onlayn» and the staff who took the scope's payments (their names are data). */
export const qabulOptions = (options: PaymentFilterOptions | undefined, t: Translate = interpolate): Option[] => [
  { value: "onlayn", label: t("Onlayn") },
  ...(options?.receivers ?? []).map((u) => ({ value: String(u.id), label: `${u.firstName} ${u.lastName}` })),
];

// The URL keeps a multi-select as one comma list (client/CLAUDE.md).
const toList = (v: string) => v.split(",").filter(Boolean);
const FIELD = "w-full sm:w-48";

function OneSelect({ value, options, onChange, label }: { value: string; options: Option[]; onChange: (v: string) => void; label: string }) {
  const t = useT();
  const current = options.find((o) => o.value === value) ?? options[0];
  // "" cannot be an item value: the default option travels as "all".
  return (
    <Select value={current.value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger className={FIELD} aria-label={label}>
        <SelectValue>{t(current.label)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || "all"} value={o.value || "all"}>
            {t(o.label)}
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
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(initialMoreOpen);
  const onSearch = useCallback((q: string) => onChange({ q }), [onChange]);
  const more = moreFiltersCount(filters);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <UrlSearchBox value={filters.q} onSearch={onSearch} label={t("To'lovni qidirish")} placeholder={t("Ism, telefon, ID yoki kvitansiya raqami")} className="sm:w-80" />
        <MultiSelectCombobox
          options={METHOD_FILTER.map((m) => ({ value: m.value, label: paymentMethodLabel(m.value, t) }))}
          selected={toList(filters.usul)}
          onChange={(next) => onChange({ usul: next.join(",") })}
          placeholder={t("Barcha usullar")}
          searchPlaceholder={t("Usul qidirish...")}
          className={FIELD}
        />
        <OneSelect value={filters.nimaga} options={NIMAGA_OPTIONS} onChange={(nimaga) => onChange({ nimaga })} label={t("Nimaga ketdi")} />
        <MultiSelectCombobox
          options={(options?.groups ?? []).map((g) => ({ value: g.id, label: g.name }))}
          selected={toList(filters.guruh)}
          onChange={(next) => onChange({ guruh: next.join(",") })}
          placeholder={t("Barcha guruhlar")}
          searchPlaceholder={t("Guruh qidirish...")}
          className={FIELD}
        />
        <Button variant="outline" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
          <SlidersHorizontal className="mr-2 size-4" />
          {!moreOpen && more > 0 ? t("Yana filtrlar · {n}", { n: more }) : t("Yana filtrlar")}
        </Button>
        <Button variant="ghost" onClick={onClear} disabled={!hasPaymentFilter(filters)}>
          {t("Tozalash")}
        </Button>
      </div>
      {moreOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <MultiSelectCombobox
            options={(options?.teachers ?? []).map((teacher) => ({ value: String(teacher.id), label: `${teacher.firstName} ${teacher.lastName}` }))}
            selected={toList(filters.ustoz)}
            onChange={(next) => onChange({ ustoz: next.join(",") })}
            placeholder={t("Barcha ustozlar")}
            searchPlaceholder={t("Ustoz qidirish...")}
            className={FIELD}
          />
          <MultiSelectCombobox
            options={(options?.courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
            selected={toList(filters.kurs)}
            onChange={(next) => onChange({ kurs: next.join(",") })}
            placeholder={t("Barcha kurslar")}
            searchPlaceholder={t("Kurs qidirish...")}
            className={FIELD}
          />
          <MultiSelectCombobox
            options={qabulOptions(options, t)}
            selected={toList(filters.qabul)}
            onChange={(next) => onChange({ qabul: next.join(",") })}
            placeholder={t("Kim qabul qildi: hammasi")}
            searchPlaceholder={t("Xodim qidirish...")}
            className={FIELD}
          />
          <OneSelect value={filters.manba} options={MANBA_OPTIONS} onChange={(manba) => onChange({ manba })} label={t("Manba")} />
          <OneSelect value={filters.holat} options={HOLAT_OPTIONS} onChange={(holat) => onChange({ holat })} label={t("Holat")} />
        </div>
      )}
    </div>
  );
}
