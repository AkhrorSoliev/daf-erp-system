"use client";

import {
  endOfMonth,
  startOfMonth,
  subMonths,
} from "date-fns";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

export type MonthsPreset =
  | "current_month"
  | "last_month"
  | "3m"
  | "6m"
  | "12m";

export interface DepartedStudentsFilter {
  preset: MonthsPreset | null;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  branchId: number | null;
  courseId: string | null;
  teacherIds: number[];
}

export interface DepartedStudentsFilterOptions {
  courses: { id: string; name: string }[];
  teachers: { id: number; fullName: string }[];
}

interface Props {
  value: DepartedStudentsFilter;
  onChange: (next: DepartedStudentsFilter) => void;
  options: DepartedStudentsFilterOptions | undefined;
}

const ALL_BRANCHES = "all";
const ALL_COURSES = "all";
const ALL_PRESET = "all";

const PRESET_LABELS: Record<MonthsPreset, string> = {
  current_month: "Joriy oy",
  last_month: "O'tgan oy",
  "3m": "Oxirgi 3 oy",
  "6m": "Oxirgi 6 oy",
  "12m": "Oxirgi 12 oy",
};

const PRESET_ORDER: MonthsPreset[] = [
  "current_month",
  "last_month",
  "3m",
  "6m",
  "12m",
];

export function defaultFilter(): DepartedStudentsFilter {
  return {
    preset: null,
    rangeStart: null,
    rangeEnd: null,
    branchId: null,
    courseId: null,
    teacherIds: [],
  };
}

/**
 * Resolve the filter into a concrete `{ start, end }` date range.
 * Custom range wins; otherwise preset is expanded; fallback is "last 6 months".
 */
export function resolveDateRange(f: DepartedStudentsFilter): {
  start: Date;
  end: Date;
} {
  if (f.rangeStart && f.rangeEnd) {
    const end = new Date(f.rangeEnd);
    end.setHours(23, 59, 59, 999);
    return { start: f.rangeStart, end };
  }
  const now = new Date();
  const endNow = new Date(now);
  endNow.setHours(23, 59, 59, 999);
  switch (f.preset) {
    case "current_month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last_month": {
      const prev = subMonths(now, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
    case "3m":
      return { start: startOfMonth(subMonths(now, 2)), end: endNow };
    case "6m":
      return { start: startOfMonth(subMonths(now, 5)), end: endNow };
    case "12m":
      return { start: startOfMonth(subMonths(now, 11)), end: endNow };
    default:
      // "Barcha davr" — for cards we need a bounded range; default to 6 months
      return { start: startOfMonth(subMonths(now, 5)), end: endNow };
  }
}

export function DepartedStudentsFilterBar({ value, onChange, options }: Props) {
  const branches = useBranchSwitcher((s) => s.branches);

  const hasCustomRange = value.rangeStart !== null || value.rangeEnd !== null;

  const teacherOptions = (options?.teachers ?? []).map((t) => ({
    value: String(t.id),
    label: t.fullName,
  }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.preset ?? ALL_PRESET}
        onValueChange={(v) => {
          const next = v === ALL_PRESET ? null : (v as MonthsPreset);
          onChange({
            ...value,
            preset: next,
            // Selecting a preset clears custom range, and vice versa.
            rangeStart: next ? null : value.rangeStart,
            rangeEnd: next ? null : value.rangeEnd,
          });
        }}
        disabled={hasCustomRange}
      >
        <SelectTrigger className="h-9 w-auto min-w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_PRESET}>Barcha davr</SelectItem>
          {PRESET_ORDER.map((p) => (
            <SelectItem key={p} value={p}>
              {PRESET_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <DatePicker
          value={value.rangeStart}
          onChange={(d) =>
            onChange({
              ...value,
              rangeStart: d ?? null,
              preset: d ? null : value.preset,
            })
          }
          placeholder="Boshi"
          className="h-9 w-[140px]"
          maxDate={value.rangeEnd ?? undefined}
          defaultMonth={value.rangeEnd ?? undefined}
        />
        <span className="text-muted-foreground text-sm">—</span>
        <DatePicker
          value={value.rangeEnd}
          onChange={(d) =>
            onChange({
              ...value,
              rangeEnd: d ?? null,
              preset: d ? null : value.preset,
            })
          }
          placeholder="Oxiri"
          className="h-9 w-[140px]"
          minDate={value.rangeStart ?? undefined}
          defaultMonth={value.rangeStart ?? undefined}
        />
        {hasCustomRange && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              onChange({ ...value, rangeStart: null, rangeEnd: null })
            }
            className="h-9 w-9 shrink-0"
            aria-label="Oraliqni tozalash"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      <Select
        value={value.branchId ? String(value.branchId) : ALL_BRANCHES}
        onValueChange={(v) =>
          onChange({
            ...value,
            branchId: v === ALL_BRANCHES ? null : Number(v),
          })
        }
      >
        <SelectTrigger className="h-9 w-auto min-w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_BRANCHES}>Barcha filiallar</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b.id} value={String(b.id)}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.courseId ?? ALL_COURSES}
        onValueChange={(v) =>
          onChange({ ...value, courseId: v === ALL_COURSES ? null : v })
        }
      >
        <SelectTrigger className="h-9 w-auto min-w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_COURSES}>Barcha kurslar</SelectItem>
          {(options?.courses ?? []).map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <MultiSelectCombobox
        options={teacherOptions}
        selected={value.teacherIds.map(String)}
        onChange={(next) =>
          onChange({ ...value, teacherIds: next.map((v) => Number(v)) })
        }
        placeholder="Barcha o'qituvchilar"
        searchPlaceholder="O'qituvchi qidirish..."
        className="min-w-[200px]"
      />
    </div>
  );
}
