"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SourceBreakdown } from "./source-breakdown";
import { StageChips } from "./stage-chips";
import type { SubmissionCounts, SubmissionStage } from "./types";

export interface ToolbarFilters {
  stage: string;
  source: string[];
  search: string;
  startDate: string;
  endDate: string;
}

interface Props {
  counts: SubmissionCounts;
  filters: ToolbarFilters;
  onChange: (updates: Partial<ToolbarFilters>) => void;
}

export function ResponsesToolbar({ counts, filters, onChange }: Props) {
  const setSearch = useCallback(
    (search: string) => onChange({ search }),
    [onChange],
  );
  const setSource = (source: string[]) => onChange({ source });
  const setDates = (startDate: string, endDate: string) =>
    onChange({ startDate, endDate });
  const hiddenActive =
    filters.source.length + (filters.startDate ? 1 : 0) + (filters.endDate ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden sm:block">
        <SourceBreakdown
          sources={counts.sources}
          value={filters.source}
          onChange={setSource}
        />
      </div>
      <StageChips
        counts={counts.stages}
        value={filters.stage as SubmissionStage | ""}
        onChange={(stage) => onChange({ stage })}
      />
      <div className="flex items-center gap-2">
        <SearchInput value={filters.search} onCommit={setSearch} />
        <div className="hidden items-center gap-2 sm:flex">
          <DateRange
            startDate={filters.startDate}
            endDate={filters.endDate}
            onChange={setDates}
          />
        </div>
        <Popover modal>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0 sm:hidden">
              <SlidersHorizontal className="size-4" />
              Filtr
              {hiddenActive > 0 && (
                <span className="tabular-nums">({hiddenActive})</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <SourceBreakdown
              sources={counts.sources}
              value={filters.source}
              onChange={setSource}
            />
            <div className="grid gap-2">
              <DateRange
                startDate={filters.startDate}
                endDate={filters.endDate}
                onChange={setDates}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

/**
 * 300 ms kutib URL'ga yozadi. URL tashqaridan o'zgarsa («Filtrlarni
 * tozalash») maydon ergashadi, lekin o'zimiz yozgan qiymatning aks-sadosi
 * foydalanuvchi hozir yozayotgan matnni ezib yubormaydi.
 */
function SearchInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [sent, setSent] = useState(value);

  if (seen !== value) {
    setSeen(value);
    if (value !== sent) setDraft(value);
  }

  useEffect(() => {
    if (draft === sent) return;
    const timer = setTimeout(() => {
      setSent(draft);
      onCommit(draft);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, sent, onCommit]);

  return (
    <div className="relative flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ism yoki telefon..."
        className="pl-8"
      />
    </div>
  );
}

function DateRange({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}) {
  const start = startDate ? parseISO(startDate) : undefined;
  const end = endDate ? parseISO(endDate) : undefined;
  const toStr = (d: Date | undefined) => (d ? format(d, "yyyy-MM-dd") : "");
  return (
    <>
      <DatePicker
        value={start ?? null}
        onChange={(d) => onChange(toStr(d), endDate)}
        placeholder="Boshlanish sanasi"
        maxDate={end}
        defaultMonth={end}
        className="w-full sm:w-44"
      />
      <DatePicker
        value={end ?? null}
        onChange={(d) => onChange(startDate, toStr(d))}
        placeholder="Tugash sanasi"
        minDate={start}
        defaultMonth={start}
        className="w-full sm:w-44"
      />
    </>
  );
}
