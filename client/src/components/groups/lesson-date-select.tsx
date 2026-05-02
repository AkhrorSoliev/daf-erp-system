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
  fullWeekdayLabel,
  getEffectiveLessonDates,
  type LessonDateOption,
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
  /**
   * Lesson dates moved here via reschedule (`LessonReschedule.newDate`).
   * Surfaced even if outside `exactDays` and tagged with a "(ko'chirilgan)"
   * badge so admins know why a Saturday is in a Mon/Wed/Fri group.
   */
  rescheduleDestinations?: (Date | string)[];
  /**
   * Dates to drop from the picker — typically cancelled days and
   * reschedule originals (lesson moved away from this date).
   */
  excludeDates?: (Date | string)[];
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
  rescheduleDestinations,
  excludeDates,
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
    const all = getEffectiveLessonDates({
      exactDays,
      groupStartDate,
      groupEndDate,
      from,
      to,
      rescheduleDestinations,
      excludeDates,
    });
    const upcoming = all.filter((o) => o.date >= today);
    const past = all.filter((o) => o.date < today).reverse(); // newest-first
    return { upcoming, past };
  }, [
    exactDays,
    groupStartDate,
    groupEndDate,
    pastDays,
    futureDays,
    today,
    rescheduleDestinations,
    excludeDates,
  ]);

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
                {upcoming.map((o) => (
                  <DateItem key={o.date.toISOString()} option={o} />
                ))}
              </SelectGroup>
            )}
            {past.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground">
                  O&apos;tgan darslar
                </SelectLabel>
                {past.map((o) => (
                  <DateItem key={o.date.toISOString()} option={o} />
                ))}
              </SelectGroup>
            )}
          </>
        )}
      </SelectContent>
    </Select>
  );
}

function DateItem({ option }: { option: LessonDateOption }) {
  return (
    <SelectItem value={format(option.date, "yyyy-MM-dd")}>
      <span className="tabular-nums">{format(option.date, "dd.MM.yyyy")}</span>
      <span className="text-muted-foreground ml-2 text-xs">
        {fullWeekdayLabel(option.date)}
      </span>
      {option.isRescheduleDestination && (
        <span className="ml-2 rounded bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
          ko&apos;chirilgan
        </span>
      )}
    </SelectItem>
  );
}
