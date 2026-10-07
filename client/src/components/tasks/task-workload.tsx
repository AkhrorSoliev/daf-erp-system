"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/ui/month-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { tashkentNow } from "@/lib/tashkent-time";
import { cn } from "@/lib/utils";
import { TaskTile } from "./task-tile";
import { allTabHref, onTimeTile, personLine, type WorkloadData, type WorkloadRow } from "./task-workload-rules";

const currentMonth = () => tashkentNow().dateStr.slice(0, 7);

function OnTime({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded bg-muted"><div className="h-full rounded bg-emerald-500" style={{ width: `${percent}%` }} /></div>
      <span className="w-10 tabular-nums">{percent}%</span>
    </div>
  );
}

function Person({ row, index }: { row: WorkloadRow; index: number }) {
  const router = useRouter();
  const { user } = row;
  const go = () => router.push(allTabHref(user.id));
  return (
    <TableRow tabIndex={0} onClick={go} onKeyDown={(e) => { if (e.key === "Enter") go(); }} className="cursor-pointer">
      <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar className="size-8">
            {user.photo && <AvatarImage src={user.photo} alt={user.firstName} />}
            <AvatarFallback className="text-xs">{user.firstName.charAt(0)}{user.lastName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{user.firstName} {user.lastName}</p>
            <p className="truncate text-xs text-muted-foreground">{personLine(user)}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="tabular-nums">{row.open}</TableCell>
      <TableCell className={cn("tabular-nums", row.overdue > 0 && "font-medium text-red-700 dark:text-red-400")}>{row.overdue}</TableCell>
      <TableCell className="tabular-nums">{row.doneThisMonth}</TableCell>
      <TableCell><OnTime percent={row.onTimePercent} /></TableCell>
    </TableRow>
  );
}

/** «Yuklama»: who carries how much, per month and branch. A row opens that person's tasks in «Barchasi». */
export function TaskWorkload() {
  const branches = useBranchSwitcher((s) => s.branches);
  const [thisMonth] = useState(currentMonth);
  const [month, setMonth] = useState(thisMonth);
  const [branchId, setBranchId] = useState<number | null>(null);
  // No retry: a 403 is final (the global interceptor has already toasted it) and would toast again on each attempt.
  const { data, isError, error, refetch } = useQuery({
    queryKey: ["tasks", "workload", month, branchId],
    queryFn: async () => (await api.get<WorkloadData>("/tasks/workload", { params: { month, branchId: branchId ?? undefined } })).data,
    retry: false,
  });
  const onTime = data ? onTimeTile(data.data) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker value={month} onChange={setMonth} maxMonth={thisMonth} className="w-48" />
        <Select value={branchId === null ? "all" : String(branchId)} onValueChange={(v) => setBranchId(v === "all" ? null : Number(v))}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha filiallar</SelectItem>
            {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <TaskTile label="Ochiq" value={data ? String(data.totals.open) : "…"} />
        <TaskTile label="Muddati o'tgan" value={data ? String(data.totals.overdue) : "…"} tone={data && data.totals.overdue > 0 ? "text-red-700 dark:text-red-400" : undefined} />
        <TaskTile label="Shu oy bajarildi" value={data ? String(data.totals.doneThisMonth) : "…"} />
        <TaskTile label="O'z vaqtida" value={!data ? "…" : onTime === null ? "—" : `${onTime}%`} />
      </div>
      <div className="rounded-lg border">
        {/* Not paginated: the server answers with everyone who holds a task, and a manager compares them at a glance. */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Xodim</TableHead>
              <TableHead>Ochiq</TableHead>
              <TableHead>Muddati o&apos;tgan</TableHead>
              <TableHead>Shu oy bajardi</TableHead>
              <TableHead>O&apos;z vaqtida</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data && !isError && [0, 1, 2, 3, 4].map((i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ))}
            {data?.data.map((row, i) => <Person key={row.user.id} row={row} index={i} />)}
          </TableBody>
        </Table>
        {isError && (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
            {getErrorMessage(error, "Yuklamani yuklab bo'lmadi")}
            <Button variant="outline" size="sm" onClick={() => void refetch()}>Qayta urinish</Button>
          </div>
        )}
        {data && data.data.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Tanlangan oyda topshiriq yo&apos;q — boshqa oyni yoki filialni tanlab ko&apos;ring</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        «O&apos;z vaqtida» — shu oy yopilgan topshiriqlardan muddatigacha yopilganlarining ulushi.
      </p>
    </div>
  );
}
