"use client";

import * as React from "react";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const UZBEK_MONTHS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr",
];

const UZBEK_MONTHS_SHORT = [
  "Yan",
  "Fev",
  "Mar",
  "Apr",
  "May",
  "Iyn",
  "Iyl",
  "Avg",
  "Sen",
  "Okt",
  "Noy",
  "Dek",
];

interface MonthPickerProps {
  value?: string | null;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Earliest selectable month ("YYYY-MM"); earlier months are disabled. */
  minMonth?: string;
  /** Latest selectable month ("YYYY-MM"); later months are disabled. */
  maxMonth?: string;
}

function formatMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = match[1];
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;
  return `${UZBEK_MONTHS[month - 1]} ${year}`;
}

export function MonthPicker({
  value,
  onChange,
  placeholder = "Oyni tanlang",
  disabled,
  className,
  id,
  minMonth,
  maxMonth,
}: MonthPickerProps) {
  const minYear = minMonth ? parseInt(minMonth.slice(0, 4), 10) : null;
  const maxYear = maxMonth ? parseInt(maxMonth.slice(0, 4), 10) : null;
  const keyOf = (year: number, monthIndex: number) =>
    `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const [open, setOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState(() => {
    const match = value && /^(\d{4})-/.exec(value);
    return match ? parseInt(match[1], 10) : new Date().getFullYear();
  });

  React.useEffect(() => {
    const match = value && /^(\d{4})-/.exec(value);
    if (match) setViewYear(parseInt(match[1], 10));
  }, [value]);

  const selectedYear = value ? parseInt(value.slice(0, 4), 10) : null;
  const selectedMonth = value ? parseInt(value.slice(5, 7), 10) : null;

  const handlePick = (monthIndex: number) => {
    const m = String(monthIndex + 1).padStart(2, "0");
    onChange?.(`${viewYear}-${m}`);
    setOpen(false);
  };

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
          {formatMonth(value) ?? <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="mb-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={minYear !== null && viewYear <= minYear}
            onClick={() => setViewYear((y) => y - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium">{viewYear}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={maxYear !== null && viewYear >= maxYear}
            onClick={() => setViewYear((y) => y + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {UZBEK_MONTHS_SHORT.map((label, idx) => {
            const isSelected =
              selectedYear === viewYear && selectedMonth === idx + 1;
            const key = keyOf(viewYear, idx);
            const outOfRange =
              (minMonth != null && key < minMonth) ||
              (maxMonth != null && key > maxMonth);
            return (
              <Button
                key={label}
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                className="h-9"
                disabled={outOfRange}
                onClick={() => handlePick(idx)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
