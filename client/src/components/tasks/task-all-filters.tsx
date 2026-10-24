"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import type { TaskFilters, TaskStatus } from "@/hooks/use-tasks";
import { useT } from "@/i18n/context";
import { CLOSED_DAYS, withSelected, type AllQuery } from "./task-all-table-rules";
import { DUE_OPTIONS, personOption } from "./task-filters";
import { STATUS_LABEL, isOpenStatus } from "./task-labels";
import { useAssignable } from "./use-assignable";

const ids = (v: string[]) => (v.length ? v.map(Number) : undefined);

interface Props { query: AllQuery; setQuery: Dispatch<SetStateAction<AllQuery>> }

/** «Barchasi» filters; each change makes a new query, which the table loads again. */
export function TaskAllFilters({ query, setQuery }: Props) {
  const t = useT();
  // Closed tasks are listed for the last CLOSED_DAYS days only; the choice says so.
  const statusOptions: MultiSelectOption[] = Object.entries(STATUS_LABEL).map(([value, label]) => ({
    value, label: isOpenStatus(value as TaskStatus) ? t(label) : t("{status} ({n} kun)", { status: t(label), n: CLOSED_DAYS }),
  }));
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
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Topshiriq bo'yicha qidirish...")} className="pl-9" />
      </div>
      <MultiSelectCombobox
        options={branches.map((b) => ({ value: String(b.id), label: b.name }))}
        selected={filters.branchId?.map(String) ?? []}
        onChange={(v) => patch({ branchId: ids(v) })}
        placeholder={t("Barcha filiallar")}
        searchPlaceholder={t("Filialni qidirish...")}
        className="w-44"
      />
      <MultiSelectCombobox
        options={withSelected(people, assignee, t)}
        selected={assignee}
        onChange={(v) => patch({ assigneeId: ids(v) })}
        placeholder={t("Barcha ijrochilar")}
        searchPlaceholder={t("Ijrochini qidirish...")}
        className="w-48"
      />
      <MultiSelectCombobox
        options={people}
        selected={filters.authorId?.map(String) ?? []}
        onChange={(v) => patch({ authorId: ids(v) })}
        placeholder={t("Barcha beruvchilar")}
        searchPlaceholder={t("Beruvchini qidirish...")}
        className="w-48"
      />
      <MultiSelectCombobox
        options={statusOptions}
        selected={query.statuses}
        onChange={(v) => setQuery((q) => ({ ...q, statuses: v as TaskStatus[] }))}
        placeholder={t("Barcha holatlar")}
        className="w-44"
      />
      <Select value={filters.due ?? "all"} onValueChange={(v) => patch({ due: v === "all" ? undefined : (v as TaskFilters["due"]) })}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>{DUE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>)}</SelectContent>
      </Select>
      {/* A pick in «Holat» already names the statuses, so the toggle has nothing to add then. */}
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={query.showClosed} disabled={query.statuses.length > 0} onCheckedChange={(showClosed) => setQuery((q) => ({ ...q, showClosed }))} />
        {t("Yopilganlar ({n} kun)", { n: CLOSED_DAYS })}
      </label>
    </div>
  );
}
