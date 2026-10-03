"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/ui/month-picker";
import { addMonths } from "@/components/payments/salary-utils";

/** «‹ Oktabr 2026 ›» — the month picker with a step either side, kept inside [min, max]. */
export function MonthStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (month: string) => void;
}) {
  const prev = addMonths(value, -1);
  const next = addMonths(value, 1);
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" aria-label="Oldingi oy" disabled={prev < min} onClick={() => onChange(prev)}>
        <ChevronLeft className="size-4" />
      </Button>
      <MonthPicker value={value} minMonth={min} maxMonth={max} onChange={onChange} className="w-44" />
      <Button variant="outline" size="icon" aria-label="Keyingi oy" disabled={next > max} onClick={() => onChange(next)}>
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
