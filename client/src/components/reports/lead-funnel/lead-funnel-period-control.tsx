"use client";

import { format } from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";
import {
  FUNNEL_START_DATE,
  PRESET_LABELS,
  visiblePresets,
  type PeriodPreset,
} from "./lead-funnel-math";

/** "YYYY-MM-DD" → mahalliy yarim tun (kalendar shu kunni belgilasin). */
function toPickerDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

interface Props {
  preset: PeriodPreset;
  startDate: string;
  endDate: string;
  onPreset: (preset: Exclude<PeriodPreset, "oraliq">) => void;
  /** `oraliq` tanlanganda yoki sanalardan biri o'zgarganda. */
  onCustomRange: (range: { startDate: string; endDate: string }) => void;
}

/**
 * Segmentli preset'lar; kalendar faqat «Oraliq» da chiqadi. Sentyabr 2026 da
 * «O'tgan oy» ko'rinmaydi (avgust voronka chegarasidan oldin, server 400).
 */
export function LeadFunnelPeriodControl({
  preset,
  startDate,
  endDate,
  onPreset,
  onCustomRange,
}: Props) {
  const presets = visiblePresets();
  const start = toPickerDate(startDate);
  const end = toPickerDate(endDate);
  const floor = toPickerDate(FUNNEL_START_DATE);

  const setBound = (key: "startDate" | "endDate", d: Date | undefined) => {
    if (!d) return;
    const value = format(d, "yyyy-MM-dd");
    const next = { startDate, endDate, [key]: value };
    // Pickerlar bir-birini cheklaydi; bu URL'dan kelgan qiymat uchun zaxira.
    if (next.startDate > next.endDate) {
      if (key === "startDate") next.endDate = value;
      else next.startDate = value;
    }
    onCustomRange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Davr"
        className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-0.5 text-sm w-fit"
      >
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={preset === p}
            onClick={() =>
              p === "oraliq" ? onCustomRange({ startDate, endDate }) : onPreset(p)
            }
            className="rounded-md px-3 py-1 transition-colors aria-pressed:bg-background aria-pressed:font-medium aria-pressed:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {preset === "oraliq" && (
        <div className="flex items-center gap-1">
          <DatePicker
            id="lead-funnel-start"
            value={start}
            onChange={(d) => setBound("startDate", d)}
            placeholder="Boshi"
            className="h-9 w-[140px]"
            minDate={floor}
            maxDate={end}
            defaultMonth={end}
          />
          <span className="text-sm text-muted-foreground" aria-hidden="true">
            –
          </span>
          <DatePicker
            id="lead-funnel-end"
            value={end}
            onChange={(d) => setBound("endDate", d)}
            placeholder="Oxiri"
            className="h-9 w-[140px]"
            minDate={start}
            defaultMonth={start}
          />
        </div>
      )}
    </div>
  );
}
