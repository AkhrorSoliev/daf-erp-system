"use client";

import { DatePicker } from "@/components/ui/date-picker";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cleanPreset, isoDay, parseDay } from "@/components/reports/departed-students/departed-url";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { ATT_FLOOR, attendanceRange, type AttendanceFilters } from "./attendance-url";

const PRESET_OPTIONS = [
  { value: "current_month", label: msg("Bu oy") },
  { value: "last_month", label: msg("O'tgan oy") },
  { value: "3m", label: msg("3 oy") },
  { value: "6m", label: msg("6 oy") },
  { value: "range", label: msg("Oraliq") },
];
const FLOOR = parseDay(ATT_FLOOR) ?? undefined;

/** The 7a period buttons and the paired «Oraliq» days, none before 2026-05-01. The page puts the table back on page 1. */
export function AttendancePeriodBar({ filters, today, onChange }: {
  filters: AttendanceFilters;
  today: Date;
  onChange: (u: Partial<AttendanceFilters>) => void;
}) {
  const t = useT();
  const preset = cleanPreset(filters.preset);
  const range = attendanceRange(filters, today);
  const pick = (v: string) => {
    if (!v) return;
    // «Oraliq» starts from the days the last period stood for, so the pickers are never empty.
    onChange(v === "range" ? { preset: v, startDate: range.startDate, endDate: range.endDate } : { preset: v, startDate: "", endDate: "" });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup type="single" variant="outline" value={preset} onValueChange={pick} aria-label={t("Davr")}>
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
            minDate={FLOOR}
            maxDate={parseDay(range.endDate) ?? undefined}
          />
          <span className="text-sm text-muted-foreground">—</span>
          <DatePicker
            value={parseDay(range.endDate)}
            onChange={(d) => d && onChange({ endDate: isoDay(d) })}
            placeholder={t("Oxiri")}
            className="w-36"
            minDate={parseDay(range.startDate) ?? FLOOR}
          />
        </div>
      )}
    </div>
  );
}
