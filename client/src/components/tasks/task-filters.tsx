"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTasks, type TaskFilters as Filters, type TaskPriority } from "@/hooks/use-tasks";
import { PRIORITY_LABEL } from "./task-labels";
import { useAssignable } from "./use-assignable";

const DUE_OPTIONS = [
  { value: "all", label: "Barcha muddatlar" },
  { value: "overdue", label: "Muddati o'tgan" },
  { value: "today", label: "Bugun" },
  { value: "week", label: "Shu hafta" },
];
const PRIORITY_OPTIONS: MultiSelectOption[] = Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }));

/** A filter changed: swap the board's filters and load it again. */
function change(patch: Partial<Filters>) {
  const { filters, setFilters, fetchBoard } = useTasks.getState();
  setFilters({ ...filters, ...patch });
  void fetchBoard();
}

export function TaskFilters() {
  const view = useTasks((s) => s.view);
  const filters = useTasks((s) => s.filters);
  const [q, setQ] = useState(filters.q ?? "");
  const { data } = useAssignable(view !== "my");

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = q.trim() || undefined;
      if (next !== useTasks.getState().filters.q) change({ q: next });
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const assigneeOptions: MultiSelectOption[] = (data?.assignees ?? []).map((u) => ({
    value: String(u.id),
    label: `${u.firstName} ${u.lastName}`,
    avatarUrl: u.photo,
    initials: `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`,
  }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Topshiriq bo'yicha qidirish..." className="pl-9" />
      </div>
      <Select value={filters.due ?? "all"} onValueChange={(v) => change({ due: v === "all" ? undefined : (v as Filters["due"]) })}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>{DUE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      <MultiSelectCombobox
        options={PRIORITY_OPTIONS}
        selected={filters.priority ?? []}
        onChange={(v) => change({ priority: v.length ? (v as TaskPriority[]) : undefined })}
        placeholder="Barcha ustuvorliklar"
        className="w-48"
      />
      {view !== "my" && (
        <MultiSelectCombobox
          options={assigneeOptions}
          selected={filters.assigneeId?.map(String) ?? []}
          onChange={(v) => change({ assigneeId: v.length ? v.map(Number) : undefined })}
          placeholder="Barcha ijrochilar"
          searchPlaceholder="Ijrochini qidirish..."
          className="w-48"
        />
      )}
    </div>
  );
}
