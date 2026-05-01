"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getLessonDatesInRange,
  fullWeekdayLabel,
} from "@/lib/lesson-dates";

interface Props {
  exactDays: string[];
  groupStartDate?: string | Date | null;
  groupEndDate?: string | Date | null;
  /** Selected date — null for empty placeholder. */
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
  /** How many days back/forward to surface. Default: 30 / 60. */
  pastDays?: number;
  futureDays?: number;
  placeholder?: string;
}

/**
 * Lesson-aware date picker: shows actual lesson dates for the group's
 * weekly schedule, grouped into "Bugun va kelgusi" + "O'tgan darslar".
 *
 * Replaces the bare DatePicker on the cancellation / override dialogs —
 * users only see days when the group actually has a lesson, so they
 * can't pick (e.g.) a Sunday for a Mon-Wed-Fri group.
 */
export function LessonDateSelect({
  exactDays,
  groupStartDate,
  groupEndDate,
  value,
  onChange,
  disabled,
  pastDays = 30,
  futureDays = 60,
  placeholder = "Dars sanasini tanlang",
}: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { upcoming, past } = useMemo(() => {
    const from = new Date(today);
    from.setDate(from.getDate() - pastDays);
    const to = new Date(today);
    to.setDate(to.getDate() + futureDays);
    const all = getLessonDatesInRange({
      exactDays,
      groupStartDate,
      groupEndDate,
      from,
      to,
    });
    const upcoming = all.filter((d) => d >= today);
    const past = all.filter((d) => d < today).reverse(); // newest-first
    return { upcoming, past };
  }, [exactDays, groupStartDate, groupEndDate, pastDays, futureDays, today]);

  const selectedKey = value ? format(value, "yyyy-MM-dd") : "";

  const handleChange = (key: string) => {
    if (!key) {
      onChange(undefined);
      return;
    }
    const [y, m, d] = key.split("-").map(Number);
    const picked = new Date(y, m - 1, d);
    onChange(picked);
  };

  const total = upcoming.length + past.length;

  return (
    <Select
      value={selectedKey}
      onValueChange={handleChange}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {total === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            Bu davrda dars sanalari topilmadi
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground">
                  Bugun va kelgusi darslar
                </SelectLabel>
                {upcoming.map((d) => (
                  <SelectItem key={d.toISOString()} value={format(d, "yyyy-MM-dd")}>
                    <span className="tabular-nums">{format(d, "dd.MM.yyyy")}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {fullWeekdayLabel(d)}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {past.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground">
                  O&apos;tgan darslar
                </SelectLabel>
                {past.map((d) => (
                  <SelectItem key={d.toISOString()} value={format(d, "yyyy-MM-dd")}>
                    <span className="tabular-nums">{format(d, "dd.MM.yyyy")}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {fullWeekdayLabel(d)}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </>
        )}
      </SelectContent>
    </Select>
  );
}
