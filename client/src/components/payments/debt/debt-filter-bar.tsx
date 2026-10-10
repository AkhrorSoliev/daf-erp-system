"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cleanSearch, type DebtFilters } from "./debt-url";
import type { DebtListResponse } from "./debt-types";

/** The search box after the URL's search changed: the bar's own write keeps what was typed since; anything else replaces it. */
export const searchBoxAfterUrl = (box: string, url: string, written: string) => (url === written ? box : url);

const PROMISE_OPTIONS = [
  { value: "all", label: "Va'da: hammasi" },
  { value: "open", label: "Va'da berganlar" },
  { value: "broken", label: "Va'dasi buzilgan" },
  { value: "none", label: "Va'dasiz" },
];
const SORT_OPTIONS = [
  { value: "debt", label: "Eng katta qarz" },
  { value: "oldest", label: "Eng uzoq qarzdor" },
  { value: "broken", label: "Va'dasi buzilganlar birinchi" },
  { value: "name", label: "Ism (A–Z)" },
];

/**
 * A search box written to the URL after a 300 ms pause (the debt and the refunds
 * pages). `value` is the URL's search; `onSearch` writes it and puts the page back
 * to 1 — pass a stable callback. Only a URL change from outside (a redirect, the
 * back button) resets the box: its own write coming back keeps what was typed since.
 */
export function UrlSearchBox({ value, onSearch, label }: { value: string; onSearch: (search: string) => void; label: string }) {
  const [search, setSearch] = useState(value);
  const [urlSearch, setUrlSearch] = useState(value);
  const [written, setWritten] = useState(value);
  if (urlSearch !== value) {
    setUrlSearch(value);
    setWritten(value);
    setSearch(searchBoxAfterUrl(search, value, written));
  }
  useEffect(() => {
    const next = cleanSearch(search);
    if (next === value) return;
    const t = setTimeout(() => {
      setWritten(next);
      onSearch(next);
    }, 300);
    return () => clearTimeout(t);
  }, [search, value, onSearch]);
  return (
    <div className="relative w-full sm:w-72">
      <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ism, telefon yoki ID" spellCheck={false} aria-label={label} className="pl-8" />
    </div>
  );
}

/** The debt list's filters (spec §2.4). Options come from the open tab's own rows; every change goes back to page 1. */
export function DebtFilterBar({ filters, setFilters, options }: {
  filters: DebtFilters;
  setFilters: (u: Partial<DebtFilters>) => void;
  options: DebtListResponse["options"] | undefined;
}) {
  const onSearch = useCallback((search: string) => setFilters({ search, page: 1 }), [setFilters]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <UrlSearchBox value={filters.search} onSearch={onSearch} label="Qarzdorni qidirish" />
      <MultiSelectCombobox
        options={(options?.groups ?? []).map((g) => ({ value: g.id, label: g.name }))}
        selected={filters.groupIds}
        onChange={(next) => setFilters({ groupIds: next, page: 1 })}
        placeholder="Barcha guruhlar"
        searchPlaceholder="Guruh qidirish..."
        className="w-48"
      />
      <MultiSelectCombobox
        options={(options?.teachers ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
        selected={filters.teacherIds}
        onChange={(next) => setFilters({ teacherIds: next, page: 1 })}
        placeholder="Barcha ustozlar"
        searchPlaceholder="Ustoz qidirish..."
        className="w-48"
      />
      <Select value={filters.promise || "all"} onValueChange={(v) => setFilters({ promise: v === "all" ? "" : v, page: 1 })}>
        <SelectTrigger className="w-48" aria-label="Va'da">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROMISE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.sort} onValueChange={(v) => setFilters({ sort: v, page: 1 })}>
        <SelectTrigger className="w-56" aria-label="Saralash">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
