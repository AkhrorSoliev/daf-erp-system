"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useTasks, type TaskCard as TaskCardData } from "@/hooks/use-tasks";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { TaskAllFilters } from "./task-all-filters";
import { allParams, allTiles, assigneeFromUrl, assigneeLabel, branchLabel, statusesToAsk, topicLine, type AllQuery } from "./task-all-table-rules";
import { isOpenStatus } from "./task-labels";
import { DueBadge } from "./task-card";
import { TaskStatusPill } from "./task-status-pill";
import { TaskTile } from "./task-tile";

type Page = { data: TaskCardData[]; nextCursor: string | null };
// `query` names the request these rows answer; a different query means they are on their way out.
type Result = { query: AllQuery; rows: TaskCardData[]; cursor: string | null; failed: boolean };

function Row({ task, index, branches }: { task: TaskCardData; index: number; branches: { id: number; name: string }[] }) {
  const openTask = useTasks((s) => s.openTask);
  const topic = topicLine(task);
  // DueBadge reads any `closedAt` as «done, no longer late»; a cancelled task has none.
  const settled = isOpenStatus(task.status) ? null : (task.closedAt ?? task.createdAt);
  return (
    <TableRow
      tabIndex={0}
      onClick={() => openTask(task.id)}
      onKeyDown={(e) => { if (e.key === "Enter") openTask(task.id); }}
      className="cursor-pointer"
    >
      <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
      <TableCell className="max-w-80 whitespace-normal">
        <div className="flex items-start gap-1.5">
          {task.kind !== "MANUAL" && <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background"><Bot className="size-3" />Tizim</span>}
          <span className="line-clamp-2">{task.title}</span>
        </div>
        {topic && <p className="text-[11px] text-muted-foreground">{topic}</p>}
      </TableCell>
      <TableCell className="whitespace-normal">{assigneeLabel(task)}</TableCell>
      <TableCell>{task.author ? `${task.author.firstName} ${task.author.lastName}` : "Tizim"}</TableCell>
      <TableCell>{branchLabel(task.branchId, branches)}</TableCell>
      <TableCell>{task.dueAt ? <DueBadge dueAt={task.dueAt} closedAt={settled} /> : "—"}</TableCell>
      <TableCell><TaskStatusPill status={task.status} /></TableCell>
    </TableRow>
  );
}

/** «Barchasi»: every task the manager may see, with its own filters (not the board's). */
export function TaskAllTable() {
  const searchParams = useSearchParams();
  // «Yuklama» sends a row here as `?assignee=<id>`; read once, the filter is the table's own after that.
  const [query, setQuery] = useState<AllQuery>(() => ({ filters: { assigneeId: assigneeFromUrl(searchParams.get("assignee")) }, statuses: [], showClosed: false }));
  const [result, setResult] = useState<Result | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const branches = useBranchSwitcher((s) => s.branches);

  useEffect(() => {
    let stale = false;
    api.get<Page>("/tasks", { params: allParams(query) })
      .then(({ data }) => { if (!stale) setResult({ query, rows: data.data, cursor: data.nextCursor, failed: false }); })
      .catch((error) => {
        if (stale) return;
        toast.error(getErrorMessage(error, "Topshiriqlarni yuklashda xatolik"));
        setResult({ query, rows: [], cursor: null, failed: true });
      });
    return () => { stale = true; };
  }, [query]);

  async function loadMore() {
    if (!result?.cursor || moreBusy || result.query !== query) return;
    setMoreBusy(true);
    try {
      const { data } = await api.get<Page>("/tasks", { params: allParams(query, result.cursor) });
      // The filters may have moved on while this was in flight: then the rows belong to nobody.
      setResult((prev) => {
        if (!prev || prev.query !== query) return prev;
        const seen = new Set(prev.rows.map((t) => t.id));
        return { ...prev, rows: [...prev.rows, ...data.data.filter((t) => !seen.has(t.id))], cursor: data.nextCursor };
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Topshiriqlarni yuklashda xatolik"));
    } finally {
      setMoreBusy(false);
    }
  }

  const rows = result?.rows ?? [];
  const refreshing = result !== null && result.query !== query;
  const closedAsked = statusesToAsk(query).some((s) => !isOpenStatus(s));
  const tiles = allTiles(rows, new Date(), closedAsked);
  const more = result?.cursor ? "+" : "";
  const num = (n: number | null) => (result === null ? "…" : n === null ? "—" : `${n}${more}`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <TaskTile label="Ochiq" value={num(tiles.open)} />
        <TaskTile label="Muddati o'tgan" value={num(tiles.overdue)} tone={tiles.overdue > 0 ? "text-red-700 dark:text-red-400" : undefined} />
        <TaskTile label="Tekshiruvda" value={num(tiles.review)} />
        <TaskTile label="Bugun yopildi" value={num(tiles.closedToday)} />
      </div>
      <TaskAllFilters query={query} setQuery={setQuery} />
      <div className={cn("rounded-lg border", refreshing && "opacity-60")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Topshiriq</TableHead>
              <TableHead>Ijrochi</TableHead>
              <TableHead>Beruvchi</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Muddat</TableHead>
              <TableHead>Holat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result === null && [0, 1, 2, 3, 4].map((i) => (
              <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
            ))}
            {rows.map((t, i) => <Row key={t.id} task={t} index={i} branches={branches} />)}
          </TableBody>
        </Table>
        {result?.failed && (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
            Topshiriqlarni yuklab bo&apos;lmadi
            <Button variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q }))}>Qayta urinish</Button>
          </div>
        )}
        {result && !result.failed && rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Topshiriq topilmadi — filtrlarni o&apos;zgartirib ko&apos;ring</p>
        )}
      </div>
      {result?.cursor && !refreshing && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={moreBusy} onClick={() => void loadMore()}>Keyingi</Button>
        </div>
      )}
    </div>
  );
}
