"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useTasks, type TaskCard as TaskCardData } from "@/hooks/use-tasks";
import { useT } from "@/i18n/context";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { TaskAllFilters } from "./task-all-filters";
import {
  CLOSED_DAYS, allParams, appendPage, assigneeFromUrl, assigneeLabel, branchLabel, closedAsked, failedResult,
  initialBranchFilter, loadedResult, topicLine, type AllQuery, type AllResult, type AllTiles,
} from "./task-all-table-rules";
import { SYSTEM_LABEL, isOpenStatus } from "./task-labels";
import { DueBadge } from "./task-card";
import { rowAsButton } from "./task-row-button";
import { TaskStatusPill } from "./task-status-pill";
import { TaskTile } from "./task-tile";

type Page = { data: TaskCardData[]; nextCursor: string | null };

function figure(tiles: AllTiles | null, pick: (tiles: AllTiles) => number | null, failed: boolean): string {
  if (!tiles) return failed ? "—" : "…";
  const n = pick(tiles);
  return n === null ? "—" : `${n}${tiles.more ? "+" : ""}`;
}

function Row({ task, index, branches }: { task: TaskCardData; index: number; branches: { id: number; name: string }[] }) {
  const t = useT();
  const openTask = useTasks((s) => s.openTask);
  const topic = topicLine(task, t);
  // DueBadge reads any `closedAt` as «done, no longer late»; a cancelled task has none.
  const settled = isOpenStatus(task.status) ? null : (task.closedAt ?? task.createdAt);
  return (
    <TableRow {...rowAsButton(() => openTask(task.id))}>
      <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
      <TableCell className="max-w-80 whitespace-normal">
        <div className="flex items-start gap-1.5">
          {task.kind !== "MANUAL" && <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background"><Bot className="size-3" />{t(SYSTEM_LABEL)}</span>}
          <span className="line-clamp-2">{task.title}</span>
        </div>
        {topic && <p className="text-[11px] text-muted-foreground">{topic}</p>}
      </TableCell>
      <TableCell className="whitespace-normal">{assigneeLabel(task, t)}</TableCell>
      <TableCell>{task.author ? `${task.author.firstName} ${task.author.lastName}` : t(SYSTEM_LABEL)}</TableCell>
      <TableCell>{branchLabel(task.branchId, branches)}</TableCell>
      <TableCell>{task.dueAt ? <DueBadge dueAt={task.dueAt} closedAt={settled} /> : "—"}</TableCell>
      <TableCell><TaskStatusPill status={task.status} /></TableCell>
    </TableRow>
  );
}

/** «Barchasi»: every task the manager may see, with its own filters (not the board's). */
export function TaskAllTable() {
  const t = useT();
  // The fetch reads t from here: a language switch must not refetch.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const searchParams = useSearchParams();
  const selected = useBranchSwitcher((s) => s.selectedBranch);
  // «Yuklama» sends a row here as `?assignee=<id>`; read once, the filter is the table's own after that.
  // The «Filial» filter starts at the header's branch (the list endpoint is not narrowed by it).
  const [query, setQuery] = useState<AllQuery>(() => ({
    filters: { assigneeId: assigneeFromUrl(searchParams.get("assignee")), branchId: initialBranchFilter(selected) },
    statuses: [], showClosed: false,
  }));
  // On a hard load the switcher resolves after this mounted: start from its branch then too.
  // (A later switch remounts the page, so this fires at most once per mount.)
  const [adopted, setAdopted] = useState(selected);
  if (selected !== adopted) {
    setAdopted(selected);
    setQuery((q) => ({ ...q, filters: { ...q.filters, branchId: initialBranchFilter(selected) } }));
  }
  const [result, setResult] = useState<AllResult | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const branches = useBranchSwitcher((s) => s.branches);
  // A write made in the drawer bumps this; the rows are read again, quietly (same query, so nothing dims).
  const version = useTasks((s) => s.version);

  useEffect(() => {
    let stale = false;
    api.get<Page>("/tasks", { params: allParams(query) })
      .then(({ data }) => { if (!stale) setResult(loadedResult(query, data.data, data.nextCursor, new Date())); })
      .catch((error) => {
        if (stale) return;
        const t = tRef.current;
        toast.error(getErrorMessage(error, t("Topshiriqlarni yuklashda xatolik")));
        // A quiet re-read that fails keeps the rows on screen; a load that fails shows the error.
        setResult((prev) => (prev && prev.query === query && !prev.failed ? prev : failedResult(prev, query)));
      });
    return () => { stale = true; };
  }, [query, version]);

  async function loadMore() {
    if (!result?.cursor || moreBusy || result.query !== query) return;
    setMoreBusy(true);
    try {
      const { data } = await api.get<Page>("/tasks", { params: allParams(query, result.cursor) });
      // The filters may have moved on while this was in flight: then the rows belong to nobody.
      const now = new Date();
      setResult((prev) => appendPage(prev, query, data.data, data.nextCursor, now));
    } catch (error) {
      toast.error(getErrorMessage(error, t("Topshiriqlarni yuklashda xatolik")));
    } finally {
      setMoreBusy(false);
    }
  }

  const rows = result?.rows ?? [];
  const refreshing = result !== null && result.query !== query;
  const tiles = result?.tiles ?? null;
  const failed = result?.failed ?? false;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <TaskTile label={t("Ochiq")} value={figure(tiles, (x) => x.open, failed)} />
        <TaskTile label={t("Muddati o'tgan")} value={figure(tiles, (x) => x.overdue, failed)} tone={tiles && tiles.overdue > 0 ? "text-red-700 dark:text-red-400" : undefined} />
        <TaskTile label={t("Tekshiruvda")} value={figure(tiles, (x) => x.review, failed)} />
        <TaskTile label={t("Bugun yopildi")} value={figure(tiles, (x) => x.closedToday, failed)} />
      </div>
      <TaskAllFilters query={query} setQuery={setQuery} />
      {/* Not paged by size: the rows come by cursor, «Keyingi» adds the next 50. */}
      <div className={refreshing ? "rounded-lg border opacity-60" : "rounded-lg border"}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>{t("Topshiriq")}</TableHead>
              <TableHead>{t("Ijrochi")}</TableHead>
              <TableHead>{t("Beruvchi")}</TableHead>
              <TableHead>{t("Filial")}</TableHead>
              <TableHead>{t("Muddat")}</TableHead>
              <TableHead>{t("Holat")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result === null && [0, 1, 2, 3, 4].map((i) => (
              <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
            ))}
            {rows.map((task, i) => <Row key={task.id} task={task} index={i} branches={branches} />)}
          </TableBody>
        </Table>
        {failed && (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
            {t("Topshiriqlarni yuklab bo'lmadi")}
            <Button variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q }))}>{t("Qayta urinish")}</Button>
          </div>
        )}
        {result && !failed && rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {closedAsked(query) ? t("Oxirgi {n} kunda topilmadi — filtrlarni o'zgartirib ko'ring", { n: CLOSED_DAYS }) : t("Topshiriq topilmadi — filtrlarni o'zgartirib ko'ring")}
          </p>
        )}
      </div>
      {result?.cursor && !refreshing && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={moreBusy} onClick={() => void loadMore()}>{t("Keyingi")}</Button>
        </div>
      )}
    </div>
  );
}
