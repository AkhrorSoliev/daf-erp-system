"use client";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { useDepartedFilterOptions } from "./departed-queries";
import { DEPARTED_CLEARED, cleanPreset, hasDepartedFilter, isoDay, parseDay, resolveDepartedRange, type DepartedFilters } from "./departed-url";

const PRESET_OPTIONS = [
  { value: "current_month", label: msg("Bu oy") },
  { value: "last_month", label: msg("O'tgan oy") },
  { value: "3m", label: msg("3 oy") },
  { value: "6m", label: msg("6 oy") },
  { value: "range", label: msg("Oraliq") },
];

/** The period, the two days of «Oraliq», the course and teacher choices and «Tozalash». The page puts the table back on page 1. `today` is the Tashkent day as a local date. */
export function DepartedFilterBar({ filters, today, onChange }: {
  filters: DepartedFilters;
  today: Date;
  onChange: (u: Partial<DepartedFilters>) => void;
}) {
  const t = useT();
  const { data: options } = useDepartedFilterOptions();
  const preset = cleanPreset(filters.preset);
  const range = resolveDepartedRange(preset, filters.startDate, filters.endDate, today);
  const pickPreset = (v: string) => {
    if (!v) return;
    // «Oraliq» starts from the days the last period stood for, so the pickers are never empty.
    onChange(v === "range" ? { preset: v, startDate: range.startDate, endDate: range.endDate } : { preset: v, startDate: "", endDate: "" });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup type="single" variant="outline" value={preset} onValueChange={pickPreset} aria-label={t("Davr")}>
        {PRESET_OPTIONS.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className="px-3">
            {t(o.label)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {preset === "range" && (
        <div className="flex items-center gap-1">
          <DatePicker
            value={parseDay(range.startDate)}
            onChange={(d) => d && onChange({ startDate: isoDay(d) })}
            placeholder={t("Boshi")}
            className="w-36"
            maxDate={parseDay(range.endDate) ?? undefined}
          />
          <span className="text-muted-foreground text-sm">—</span>
          <DatePicker
            value={parseDay(range.endDate)}
            onChange={(d) => d && onChange({ endDate: isoDay(d) })}
            placeholder={t("Oxiri")}
            className="w-36"
            minDate={parseDay(range.startDate) ?? undefined}
          />
        </div>
      )}
      <MultiSelectCombobox
        options={(options?.courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
        selected={filters.courseId}
        onChange={(courseId) => onChange({ courseId })}
        placeholder={t("Barcha kurslar")}
        searchPlaceholder={t("Kurs qidirish...")}
        className="w-auto min-w-40"
      />
      <MultiSelectCombobox
        options={(options?.teachers ?? []).map((teacher) => ({ value: String(teacher.id), label: teacher.fullName }))}
        selected={filters.teacherIds}
        onChange={(teacherIds) => onChange({ teacherIds })}
        placeholder={t("Barcha o'qituvchilar")}
        searchPlaceholder={t("O'qituvchi qidirish...")}
        className="w-auto min-w-48"
      />
      {hasDepartedFilter(filters) && (
        <Button type="button" variant="ghost" onClick={() => onChange(DEPARTED_CLEARED)}>
          {t("Tozalash")}
        </Button>
      )}
    </div>
  );
}
