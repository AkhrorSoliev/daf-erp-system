"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2, Settings } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartCard } from "./chart-card";
import { EnrollmentTransferReasonsDialog } from "./enrollment-transfer-reasons-dialog";

interface ReasonsResponse {
  data: { reasonId: string | null; reasonName: string; count: number }[];
}

interface Props {
  branchId: number | null;
  courseId: string | null;
  teacherIds: number[];
  startDate: string;
  endDate: string;
}

const TOP_N = 5;
const OTHERS_ID = "__others__";

const PALETTE = [
  "#06b6d4",
  "#8b5cf6",
  "#f59e0b",
  "#22c55e",
  "#ef4444",
];
const OTHERS_COLOR = "#94a3b8";

export function TransferReasonsChart({
  branchId,
  courseId,
  teacherIds,
  startDate,
  endDate,
}: Props) {
  const user = useAuth((s) => s.user);
  const canManageReasons =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  const [drilldown, setDrilldown] = useState<{
    reasonId: string | null;
    reasonName: string;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const params = {
    branchId: branchId ?? undefined,
    courseId: courseId ?? undefined,
    teacherIds: teacherIds.length > 0 ? teacherIds.join(",") : undefined,
    startDate,
    endDate,
  };

  const { data, isLoading } = useQuery<ReasonsResponse>({
    queryKey: ["transfer-reasons", params],
    queryFn: () =>
      api
        .get<ReasonsResponse>(
          "/reports/departed-students/transfer-reasons",
          { params },
        )
        .then((r) => r.data),
    staleTime: 0,
  });

  const { rows, grandTotal } = useMemo(() => {
    const all = data?.data ?? [];
    const total = all.reduce((sum, r) => sum + r.count, 0);
    if (all.length <= TOP_N) {
      return {
        rows: all.map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] })),
        grandTotal: total,
      };
    }
    const top = all.slice(0, TOP_N);
    const tail = all.slice(TOP_N);
    const othersCount = tail.reduce((sum, r) => sum + r.count, 0);
    return {
      rows: [
        ...top.map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] })),
        {
          reasonId: OTHERS_ID,
          reasonName: `Boshqalar (${tail.length} ta sabab)`,
          count: othersCount,
          color: OTHERS_COLOR,
        },
      ],
      grandTotal: total,
    };
  }, [data]);

  const isEmpty = rows.length === 0;
  const topReasonName =
    rows.find((r) => r.reasonId !== OTHERS_ID)?.reasonName ?? "";
  const topReasonCount =
    rows.find((r) => r.reasonId !== OTHERS_ID)?.count ?? 0;

  return (
    <>
      <ChartCard
        title="Nima uchun o'quvchi guruhni o'zgartirdi?"
        subtitle={
          grandTotal > 0
            ? `Jami ${grandTotal} ta transfer${topReasonName ? ` — eng asosiy: ${topReasonName} (${topReasonCount} ta)` : ""}`
            : "O'quvchi transferi sabablari"
        }
        tooltip={
          "Tanlangan davrda o'quvchilar bir guruhdan boshqasiga o'tkazilishi sabablari bo'yicha taqsimot.\n" +
          `Eng ko'p uchragan ${TOP_N} ta sabab alohida, qolganlari "Boshqalar"ga yig'ilgan.\n` +
          "Segment yoki qator ustiga bosing — shu sabab bilan transfer bo'lgan o'quvchilar ochiladi."
        }
        isLoading={isLoading}
        isEmpty={isEmpty}
        emptyMessage="Tanlangan davrda transfer yo'q — davrni kengaytirib ko'ring"
        bodyHeightClass="h-[260px]"
        headerAction={
          canManageReasons ? (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSettingsOpen(true)}
              aria-label="Sabablarni boshqarish"
              title="Sabablarni boshqarish"
            >
              <Settings className="size-4" />
            </Button>
          ) : undefined
        }
      >
        {!isEmpty && !isLoading && (
          <div className="flex h-full items-center gap-4">
            <div className="relative h-full w-[200px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rows}
                    dataKey="count"
                    nameKey="reasonName"
                    innerRadius={58}
                    outerRadius={96}
                    paddingAngle={1}
                    strokeWidth={2}
                    stroke="hsl(var(--card))"
                    onClick={(p: any) => {
                      const reasonId = p?.payload?.reasonId;
                      if (reasonId !== OTHERS_ID) {
                        setDrilldown({
                          reasonId,
                          reasonName: p.payload.reasonName,
                        });
                      }
                    }}
                    style={{ cursor: "pointer", outline: "none" }}
                  >
                    {rows.map((r) => (
                      <Cell key={r.reasonId ?? "null"} fill={r.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip total={grandTotal} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-2xl font-bold tabular-nums leading-none">
                  {grandTotal}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                  Jami
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-1 overflow-auto max-h-full">
              {rows.map((r) => {
                const percent = grandTotal > 0 ? (r.count / grandTotal) * 100 : 0;
                const isOthers = r.reasonId === OTHERS_ID;
                return (
                  <button
                    key={r.reasonId ?? "null"}
                    type="button"
                    disabled={isOthers}
                    onClick={() =>
                      setDrilldown({
                        reasonId: r.reasonId,
                        reasonName: r.reasonName,
                      })
                    }
                    className="group w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-transparent"
                  >
                    <span
                      className="size-3 rounded-sm shrink-0"
                      style={{ backgroundColor: r.color }}
                    />
                    <span className="text-xs flex-1 truncate" title={r.reasonName}>
                      {r.reasonName}
                    </span>
                    <span className="text-xs font-semibold tabular-nums shrink-0">
                      {r.count}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                      {percent.toFixed(1)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </ChartCard>
      <TransferDrilldownDialog
        drilldown={drilldown}
        onClose={() => setDrilldown(null)}
        filterParams={params}
      />
      {canManageReasons && (
        <EnrollmentTransferReasonsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}
    </>
  );
}

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: ReadonlyArray<any>;
  total: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as
    | { reasonName?: string; count?: number; color?: string }
    | undefined;
  if (!row) return null;
  const percent = total > 0 ? ((row.count ?? 0) / total) * 100 : 0;
  return (
    <div className="rounded-md border bg-popover text-popover-foreground px-3 py-2 text-xs shadow-md min-w-[180px]">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="size-2.5 rounded-full shrink-0"
          style={{ backgroundColor: row.color }}
        />
        <span className="font-medium truncate">{row.reasonName}</span>
      </div>
      <div className="flex items-center justify-between gap-4 pl-4">
        <span className="text-muted-foreground">Soni</span>
        <span className="font-semibold tabular-nums">{row.count} ta</span>
      </div>
      <div className="flex items-center justify-between gap-4 pl-4">
        <span className="text-muted-foreground">Ulush</span>
        <span className="font-semibold tabular-nums">{percent.toFixed(1)}%</span>
      </div>
    </div>
  );
}

interface TransferListResponse {
  data: {
    id: string;
    student: { id: number; fullName: string };
    fromGroup: { id: string; name: string } | null;
    toGroup: { id: string; name: string } | null;
    branch: { id: number; name: string } | null;
    transferredAt: string | null;
    reason: { id: string; name: string } | null;
  }[];
  total: number;
}

function TransferDrilldownDialog({
  drilldown,
  onClose,
  filterParams,
}: {
  drilldown: { reasonId: string | null; reasonName: string } | null;
  onClose: () => void;
  filterParams: {
    branchId?: number;
    courseId?: string;
    teacherIds?: string;
    startDate: string;
    endDate: string;
  };
}) {
  const open = drilldown !== null;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    if (open) setPage(1);
  }, [open, drilldown?.reasonId]);

  const queryParams = open
    ? {
        ...filterParams,
        page,
        pageSize,
        transferReasonId: drilldown.reasonId ?? "null",
      }
    : null;

  const { data, isLoading } = useQuery<TransferListResponse>({
    queryKey: ["transferred-list-drilldown", queryParams],
    queryFn: () =>
      api
        .get<TransferListResponse>(
          "/reports/departed-students/transferred-list",
          { params: queryParams },
        )
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="!max-w-[min(1200px,95vw)] w-[min(1200px,95vw)] max-h-[85vh] overflow-hidden flex flex-col gap-4 p-6">
        <DialogHeader>
          <DialogTitle>{drilldown?.reasonName ?? ""}</DialogTitle>
          <DialogDescription>
            Shu sabab bilan guruhni o&apos;zgartirgan o&apos;quvchilar
            {!isLoading && data ? ` (${data.total} ta)` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40">
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>O&apos;quvchi</TableHead>
                <TableHead>Qaysi guruhdan</TableHead>
                <TableHead>Qaysi guruhga</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Sana</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j} className={j === 0 ? "border-r" : ""}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data || data.data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-16 text-muted-foreground"
                  >
                    Ma&apos;lumot yo&apos;q
                  </TableCell>
                </TableRow>
              ) : (
                data.data.map((row, i) => (
                  <TableRow key={row.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {(clampedPage - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.student.fullName}
                    </TableCell>
                    <TableCell>{row.fromGroup?.name ?? "—"}</TableCell>
                    <TableCell>{row.toGroup?.name ?? "—"}</TableCell>
                    <TableCell>{row.branch?.name ?? "—"}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {row.transferredAt
                        ? format(new Date(row.transferredAt), "dd.MM.yyyy")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Yuklanmoqda...
              </span>
            ) : (
              <>
                <span>Sahifada:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 40, 50].map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>
                  Jami:{" "}
                  <span className="tabular-nums">
                    {total.toLocaleString("en-US")}
                  </span>
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground tabular-nums">
              {clampedPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={clampedPage <= 1 || isLoading}
              onClick={() => setPage(clampedPage - 1)}
              aria-label="Oldingi"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={clampedPage >= totalPages || isLoading}
              onClick={() => setPage(clampedPage + 1)}
              aria-label="Keyingi"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
