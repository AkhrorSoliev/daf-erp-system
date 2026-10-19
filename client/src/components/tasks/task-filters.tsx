"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTasks, type TaskCard, type TaskFilters as Filters, type TaskPerson, type TaskPriority } from "@/hooks/use-tasks";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { PRIORITY_LABEL, STATUS_COLUMNS } from "./task-labels";
import { useAssignable } from "./use-assignable";

// msg() labels: the filter bars draw them with t().
export const DUE_OPTIONS = [
  { value: "all", label: msg("Barcha muddatlar") },
  { value: "overdue", label: msg("Muddati o'tgan") },
  { value: "today", label: msg("Bugun") },
  { value: "week", label: msg("Shu hafta") },
];

/** A filter changed: swap the board's filters and load it again. */
function change(patch: Partial<Filters>) {
  const { filters, setFilters, fetchBoard } = useTasks.getState();
  setFilters({ ...filters, ...patch });
  void fetchBoard();
}

export const personOption = (p: TaskPerson): MultiSelectOption => ({
  value: String(p.id),
  label: `${p.firstName} ${p.lastName}`,
  avatarUrl: p.photo,
  initials: `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`,
});

/** The authors of the cards on the board, plus those already seen (a narrowed board shows fewer). */
function authorsOf(cards: TaskCard[], seen: TaskPerson[]): TaskPerson[] {
  const byId = new Map(seen.map((p) => [p.id, p]));
  for (const card of cards) if (card.author) byId.set(card.author.id, card.author);
  return [...byId.values()].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
}

export function TaskFilters() {
  const t = useT();
  const priorityOptions: MultiSelectOption[] = Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label: t(label) }));
  const view = useTasks((s) => s.view);
  const filters = useTasks((s) => s.filters);
  const columns = useTasks((s) => s.columns);
  const [q, setQ] = useState(filters.q ?? "");
  const [seenAuthors, setSeenAuthors] = useState<TaskPerson[]>([]);
  const { data } = useAssignable(view !== "my");
  // «Menga berilgan»: whoever gave me a task on the board (the assignable list is who I may give to).
  const authors = view === "my" ? authorsOf(STATUS_COLUMNS.flatMap((c) => columns[c.id].items), seenAuthors) : [];

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = q.trim() || undefined;
      if (next !== useTasks.getState().filters.q) change({ q: next });
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Topshiriq bo'yicha qidirish...")} className="pl-9" />
      </div>
      <Select value={filters.due ?? "all"} onValueChange={(v) => change({ due: v === "all" ? undefined : (v as Filters["due"]) })}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>{DUE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>)}</SelectContent>
      </Select>
      <MultiSelectCombobox
        options={priorityOptions}
        selected={filters.priority ?? []}
        onChange={(v) => change({ priority: v.length ? (v as TaskPriority[]) : undefined })}
        placeholder={t("Barcha ustuvorliklar")}
        className="w-48"
      />
      {view === "my" ? (
        <MultiSelectCombobox
          options={authors.map(personOption)}
          selected={filters.authorId?.map(String) ?? []}
          onChange={(v) => {
            // The board narrows to the pick: keep today's authors so a second one can still be added.
            setSeenAuthors(authors);
            change({ authorId: v.length ? v.map(Number) : undefined });
          }}
          placeholder={t("Barcha beruvchilar")}
          searchPlaceholder={t("Beruvchini qidirish...")}
          className="w-48"
        />
      ) : (
        <MultiSelectCombobox
          options={(data?.assignees ?? []).map(personOption)}
          selected={filters.assigneeId?.map(String) ?? []}
          onChange={(v) => change({ assigneeId: v.length ? v.map(Number) : undefined })}
          placeholder={t("Barcha ijrochilar")}
          searchPlaceholder={t("Ijrochini qidirish...")}
          className="w-48"
        />
      )}
    </div>
  );
}
