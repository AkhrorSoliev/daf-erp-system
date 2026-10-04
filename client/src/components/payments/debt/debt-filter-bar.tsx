"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DebtFilters } from "./debt-url";
import type { DebtListResponse } from "./debt-types";

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

/** The debt list's filters (spec §2.4). Options come from the open tab's own rows; every change goes back to page 1. */
export function DebtFilterBar({ filters, setFilters, options }: {
  filters: DebtFilters;
  setFilters: (u: Partial<DebtFilters>) => void;
  options: DebtListResponse["options"] | undefined;
}) {
  // A local mirror keeps typing smooth; the URL gets it after a 300 ms pause.
  // A URL change from outside (a redirect, the back button) resets the mirror.
  const [search, setSearch] = useState(filters.search);
  const [urlSearch, setUrlSearch] = useState(filters.search);
  if (urlSearch !== filters.search) {
    setUrlSearch(filters.search);
    setSearch(filters.search);
  }
  useEffect(() => {
    if (search === filters.search) return;
    const t = setTimeout(() => setFilters({ search, page: 1 }), 300);
    return () => clearTimeout(t);
  }, [search, filters.search, setFilters]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ism, telefon yoki ID"
          spellCheck={false}
          aria-label="Qarzdorni qidirish"
          className="pl-8"
        />
      </div>
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
