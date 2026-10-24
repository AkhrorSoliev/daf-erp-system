"use client";

import { format } from "date-fns";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DatePicker } from "@/components/ui/date-picker";
import { cleanPeriodId, PAYMENTS_FLOOR_DAY, type PaymentFilters, type PeriodId } from "./payments-url";

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "bugun", label: msg("Bugun") },
  { id: "kecha", label: msg("Kecha") },
  { id: "hafta", label: msg("Bu hafta") },
  { id: "oy", label: msg("Bu oy") },
  { id: "otgan-oy", label: msg("O'tgan oy") },
  { id: "oraliq", label: msg("Oraliq") },
];

/** `YYYY-MM-DD` → the local midnight a `<DatePicker>` shows; anything else → nothing. */
const toDate = (day: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
};
const FLOOR = toDate(PAYMENTS_FLOOR_DAY);

/**
 * The period chips (spec B4 §3.3). Changing the period keeps the filters and
 * goes back to page 1; the two «Oraliq» dates are a start/end pair.
 */
export function PaymentsPeriodBar({ filters, onChange }: { filters: PaymentFilters; onChange: (u: Partial<PaymentFilters>) => void }) {
  const t = useT();
  const davr = cleanPeriodId(filters.davr);
  const start = toDate(filters.dan);
  const end = toDate(filters.gacha);
  const reversed = Boolean(start && end && end < start);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={davr}
          onValueChange={(v) => v && onChange({ davr: v, ...(v === "oraliq" ? {} : { dan: "", gacha: "" }) })}
          aria-label={t("Davr")}
          className="flex-wrap"
        >
          {PERIODS.map((p) => (
            <ToggleGroupItem key={p.id} value={p.id} className="px-3">
              {t(p.label)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {davr === "oraliq" && (
          <div className="flex items-center gap-2">
            <DatePicker
              value={start}
              onChange={(d) => onChange({ dan: d ? format(d, "yyyy-MM-dd") : "" })}
              placeholder={t("Boshi")}
              minDate={FLOOR}
              maxDate={end}
              defaultMonth={end}
              className="w-40"
            />
            <span className="text-muted-foreground">—</span>
            <DatePicker
              value={end}
              onChange={(d) => onChange({ gacha: d ? format(d, "yyyy-MM-dd") : "" })}
              placeholder={t("Oxiri")}
              minDate={start && FLOOR && start > FLOOR ? start : FLOOR}
              defaultMonth={start}
              className="w-40"
            />
          </div>
        )}
      </div>
      {reversed && <p className="text-sm text-destructive">{t("Boshi oxiridan keyin bo'lmasin")}</p>}
    </div>
  );
}
