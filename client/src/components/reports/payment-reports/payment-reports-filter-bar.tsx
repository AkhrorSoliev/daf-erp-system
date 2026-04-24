"use client";

import { format } from "date-fns";
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
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

export interface PaymentReportsFilter {
  branchId: number | null;
  year: number;
  month: number | null;
  rangeStart: Date | null;
  rangeEnd: Date | null;
}

interface PaymentReportsFilterBarProps {
  value: PaymentReportsFilter;
  onChange: (next: PaymentReportsFilter) => void;
}

const MONTHS = [
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

const ALL_BRANCHES = "all";
const ALL_MONTHS = "all";

export function resolveFilterRange(f: PaymentReportsFilter): {
  start: Date;
  end: Date;
  label: string;
} {
  if (f.rangeStart && f.rangeEnd) {
    const end = new Date(f.rangeEnd);
    end.setHours(23, 59, 59, 999);
    return {
      start: f.rangeStart,
      end,
      label: `${format(f.rangeStart, "dd.MM.yyyy")} — ${format(f.rangeEnd, "dd.MM.yyyy")}`,
    };
  }
  if (f.month !== null) {
    const start = new Date(f.year, f.month, 1);
    const end = new Date(f.year, f.month + 1, 0, 23, 59, 59, 999);
    return { start, end, label: `${MONTHS[f.month]} ${f.year}` };
  }
  const start = new Date(f.year, 0, 1);
  const end = new Date(f.year, 11, 31, 23, 59, 59, 999);
  return { start, end, label: `${f.year}-yil` };
}

export function defaultFilter(): PaymentReportsFilter {
  const now = new Date();
  return {
    branchId: null,
    year: now.getFullYear(),
    month: now.getMonth(),
    rangeStart: null,
    rangeEnd: null,
  };
}

export function PaymentReportsFilterBar({
  value,
  onChange,
}: PaymentReportsFilterBarProps) {
  const branches = useBranchSwitcher((s) => s.branches);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);
  const hasCustomRange = value.rangeStart !== null && value.rangeEnd !== null;

  return (
    <div className="flex flex-wrap items-center gap-2">
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
        value={String(value.year)}
        onValueChange={(v) => onChange({ ...value, year: Number(v) })}
        disabled={hasCustomRange}
      >
        <SelectTrigger className="h-9 w-auto min-w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}-yil
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.month === null ? ALL_MONTHS : String(value.month)}
        onValueChange={(v) =>
          onChange({
            ...value,
            month: v === ALL_MONTHS ? null : Number(v),
          })
        }
        disabled={hasCustomRange}
      >
        <SelectTrigger className="h-9 w-auto min-w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_MONTHS}>Butun yil</SelectItem>
          {MONTHS.map((m, i) => (
            <SelectItem key={m} value={String(i)}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <DatePicker
          value={value.rangeStart}
          onChange={(d) => onChange({ ...value, rangeStart: d ?? null })}
          placeholder="Boshi"
          className="h-9 w-[140px]"
          maxDate={value.rangeEnd ?? undefined}
          defaultMonth={value.rangeEnd ?? undefined}
        />
        <span className="text-muted-foreground text-sm">—</span>
        <DatePicker
          value={value.rangeEnd}
          onChange={(d) => onChange({ ...value, rangeEnd: d ?? null })}
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
    </div>
  );
}
