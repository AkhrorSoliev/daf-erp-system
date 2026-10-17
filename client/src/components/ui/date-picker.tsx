"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useLocale, useT } from "@/i18n/context";
import { dateFnsLocale } from "@/lib/date-fns-locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  value?: Date | null;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Earliest selectable date (inclusive). Useful for range end-pickers. */
  minDate?: Date;
  /** Latest selectable date (inclusive). Useful for range start-pickers. */
  maxDate?: Date;
  /** Month to open the calendar on when `value` is not set (e.g. the other end of a range). */
  defaultMonth?: Date;
  /** Day-of-week numbers (0=Sun, 1=Mon, …, 6=Sat) to disable in the calendar. */
  disabledDaysOfWeek?: number[];
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  id,
  minDate,
  maxDate,
  defaultMonth,
  disabledDaysOfWeek,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const t = useT();
  // Outside the dashboard's provider (student portal, public form) this is "uz".
  const { locale } = useLocale();

  const disabledMatcher = React.useMemo(() => {
    const matchers: Array<
      { before: Date } | { after: Date } | { dayOfWeek: number[] }
    > = [];
    if (minDate) matchers.push({ before: minDate });
    if (maxDate) matchers.push({ after: maxDate });
    if (disabledDaysOfWeek && disabledDaysOfWeek.length > 0) {
      matchers.push({ dayOfWeek: disabledDaysOfWeek });
    }
    return matchers.length > 0 ? matchers : undefined;
  }, [minDate, maxDate, disabledDaysOfWeek]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          data-empty={!value}
          className={cn(
            "w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value ? format(value, "dd.MM.yyyy") : <span>{placeholder ?? t("Sanani tanlang")}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          weekStartsOn={1}
          locale={dateFnsLocale(locale)}
          labels={{
            labelPrevious: () => t("Oldingi oy"),
            labelNext: () => t("Keyingi oy"),
          }}
          selected={value ?? undefined}
          defaultMonth={value ?? defaultMonth}
          disabled={disabledMatcher}
          onSelect={(date) => {
            onChange?.(date);
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
