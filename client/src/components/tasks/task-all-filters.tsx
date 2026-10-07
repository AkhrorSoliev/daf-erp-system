"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import type { TaskFilters, TaskStatus } from "@/hooks/use-tasks";
import { withSelected, type AllQuery } from "./task-all-table-rules";
import { DUE_OPTIONS, personOption } from "./task-filters";
import { STATUS_LABEL } from "./task-labels";
import { useAssignable } from "./use-assignable";

const STATUS_OPTIONS: MultiSelectOption[] = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));
const ids = (v: string[]) => (v.length ? v.map(Number) : undefined);

interface Props { query: AllQuery; setQuery: Dispatch<SetStateAction<AllQuery>> }

/** «Barchasi» filters; each change makes a new query, which the table loads again. */
export function TaskAllFilters({ query, setQuery }: Props) {
  const { filters } = query;
  const branches = useBranchSwitcher((s) => s.branches);
  const { data } = useAssignable();
  const people = (data?.assignees ?? []).map(personOption);
  const [text, setText] = useState("");
  const patch = (p: Partial<TaskFilters>) => setQuery((q) => ({ ...q, filters: { ...q.filters, ...p } }));

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = text.trim() || undefined;
      setQuery((q) => (q.filters.q === next ? q : { ...q, filters: { ...q.filters, q: next } }));
    }, 300);
    return () => clearTimeout(timer);
  }, [text, setQuery]);

  const assignee = filters.assigneeId?.map(String) ?? [];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Topshiriq bo'yicha qidirish..." className="pl-9" />
      </div>
      <MultiSelectCombobox
        options={branches.map((b) => ({ value: String(b.id), label: b.name }))}
        selected={filters.branchId?.map(String) ?? []}
        onChange={(v) => patch({ branchId: ids(v) })}
        placeholder="Barcha filiallar"
        searchPlaceholder="Filialni qidirish..."
        className="w-44"
      />
      <MultiSelectCombobox
        options={withSelected(people, assignee)}
        selected={assignee}
        onChange={(v) => patch({ assigneeId: ids(v) })}
        placeholder="Barcha ijrochilar"
        searchPlaceholder="Ijrochini qidirish..."
        className="w-48"
      />
      <MultiSelectCombobox
        options={people}
        selected={filters.authorId?.map(String) ?? []}
        onChange={(v) => patch({ authorId: ids(v) })}
        placeholder="Barcha beruvchilar"
        searchPlaceholder="Beruvchini qidirish..."
        className="w-48"
      />
      <MultiSelectCombobox
        options={STATUS_OPTIONS}
        selected={query.statuses}
        onChange={(v) => setQuery((q) => ({ ...q, statuses: v as TaskStatus[] }))}
        placeholder="Barcha holatlar"
        className="w-44"
      />
      <Select value={filters.due ?? "all"} onValueChange={(v) => patch({ due: v === "all" ? undefined : (v as TaskFilters["due"]) })}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>{DUE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      {/* A pick in «Holat» already names the statuses, so the toggle has nothing to add then. */}
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={query.showClosed} disabled={query.statuses.length > 0} onCheckedChange={(showClosed) => setQuery((q) => ({ ...q, showClosed }))} />
        Yopilganlar
      </label>
    </div>
  );
}
