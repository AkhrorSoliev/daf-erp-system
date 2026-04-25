"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  UserX,
} from "lucide-react";
import api from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RetentionMetrics {
  totalTeacherChanges: number;
  departedAfterTeacherChange: number;
}

interface TeacherChangeRow {
  id: string;
  groupId: string;
  groupName: string;
  branchName: string;
  courseName: string;
  previousTeachers: string[];
  newTeachers: string[];
  changeType: "ADDED" | "REMOVED" | "REPLACED";
  triggeredByDismissal: boolean;
  changedAt: string;
  changedBy: string | null;
}

interface DepartedAfterChangeRow {
  enrollmentId: string;
  studentId: number;
  studentName: string;
  groupId: string;
  groupName: string;
  branchName: string;
  teacherChangeAt: string;
  departedAt: string;
  lessonNumber: number;
  previousTeachers: string[];
  newTeachers: string[];
  departureReason: string | null;
}

interface QueryParams {
  branchId?: number;
  courseId?: string;
  teacherIds?: string;
  startDate: string;
  endDate: string;
}

interface Props {
  data: RetentionMetrics | undefined;
  isLoading: boolean;
  queryParams: QueryParams;
}

const WINDOW_EXPLANATION =
  "Ustoz almashgandan keyin guruhning dastlabki 5 dars davomida ketgan o'quvchilar hisoblanadi.\n" +
  "6-darsdan keyin ketsa — ustoz sabab emas deb hisoblanadi.";

export function TeacherChangeRetentionCards({
  data,
  isLoading,
  queryParams,
}: Props) {
  const [changesOpen, setChangesOpen] = useState(false);
  const [departedOpen, setDepartedOpen] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-5 w-64" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-[104px] rounded-xl" />
          <Skeleton className="h-[104px] rounded-xl" />
        </div>
      </div>
    );
  }

  const ratePercent =
    data.totalTeacherChanges > 0
      ? (data.departedAfterTeacherChange / data.totalTeacherChanges) * 100
      : 0;

  const rateColor =
    ratePercent >= 30
      ? "text-red-600 dark:text-red-400"
      : ratePercent >= 15
        ? "text-amber-600 dark:text-amber-400"
        : undefined;

  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-base">
              Guruh o&apos;zgarishi — Saqlab qolish vositasi
            </h3>
            <p className="text-xs text-muted-foreground">
              Ustoz almashishi o&apos;quvchilarning ketishiga qanday ta&apos;sir qilganini
              ko&apos;rsatadi
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Tushuntirish"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Info className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs whitespace-pre-line">
              {WINDOW_EXPLANATION}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ClickableKpiCard
            icon={<ArrowRightLeft className="size-4" />}
            label="Jami o'zgarishlar"
            value={data.totalTeacherChanges.toLocaleString("en-US")}
            disabled={data.totalTeacherChanges === 0}
            onClick={() => setChangesOpen(true)}
          />
          <ClickableKpiCard
            icon={<UserX className="size-4" />}
            label="O'zgargandan keyin ketish"
            value={data.departedAfterTeacherChange.toLocaleString("en-US")}
            secondary={
              data.totalTeacherChanges > 0
                ? `${ratePercent.toFixed(1)}% (${data.departedAfterTeacherChange} / ${data.totalTeacherChanges})`
                : undefined
            }
            valueColor={rateColor}
            disabled={data.departedAfterTeacherChange === 0}
            onClick={() => setDepartedOpen(true)}
          />
        </div>
      </div>

      <TeacherChangesDialog
        open={changesOpen}
        onOpenChange={setChangesOpen}
        queryParams={queryParams}
      />
      <DepartedAfterChangeDialog
        open={departedOpen}
        onOpenChange={setDepartedOpen}
        queryParams={queryParams}
      />
    </>
  );
}

interface ClickableKpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  secondary?: string;
  valueColor?: string;
  disabled: boolean;
  onClick: () => void;
}

function ClickableKpiCard({
  icon,
  label,
  value,
  secondary,
  valueColor,
  disabled,
  onClick,
}: ClickableKpiCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border bg-background p-4 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={`text-2xl font-semibold tabular-nums mt-2 ${valueColor ?? ""}`}
      >
        {value}
      </div>
      {secondary && (
        <div className="text-xs text-muted-foreground mt-1">{secondary}</div>
      )}
      {!disabled && (
        <div className="text-xs text-muted-foreground mt-2">
          Batafsil ko&apos;rish uchun bosing
        </div>
      )}
    </button>
  );
}

const CHANGE_TYPE_LABELS: Record<TeacherChangeRow["changeType"], string> = {
  ADDED: "Qo'shildi",
  REMOVED: "Olib tashlandi",
  REPLACED: "Almashtirildi",
};

function TeacherChangesDialog({
  open,
  onOpenChange,
  queryParams,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  queryParams: QueryParams;
}) {
  const { data, isLoading } = useQuery<TeacherChangeRow[]>({
    queryKey: ["teacher-changes-list", queryParams],
    queryFn: () =>
      api
        .get<TeacherChangeRow[]>(
          "/reports/departed-students/teacher-changes-list",
          { params: queryParams },
        )
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    if (open) setPage(1);
  }, [open]);

  const total = data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pagedData = useMemo(
    () =>
      data?.slice((clampedPage - 1) * pageSize, clampedPage * pageSize) ?? [],
    [data, clampedPage, pageSize],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(1200px,95vw)] w-[min(1200px,95vw)] max-h-[85vh] overflow-hidden flex flex-col gap-4 p-6">
        <DialogHeader>
          <DialogTitle>Ustoz almashish hodisalari</DialogTitle>
          <DialogDescription>
            Tanlangan davrdagi barcha guruh ustoz o&apos;zgarishlari
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40">
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>Sana</TableHead>
                <TableHead>Guruh</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Oldingi ustoz</TableHead>
                <TableHead>Yangi ustoz</TableHead>
                <TableHead>Tur</TableHead>
                <TableHead>Sabab</TableHead>
                <TableHead>O&apos;zgartirgan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j} className={j === 0 ? "border-r" : ""}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data || data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center py-16 text-muted-foreground"
                  >
                    Ma&apos;lumot yo&apos;q
                  </TableCell>
                </TableRow>
              ) : (
                pagedData.map((row, i) => (
                  <TableRow key={row.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {(clampedPage - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {format(new Date(row.changedAt), "dd.MM.yyyy, HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.groupName}
                    </TableCell>
                    <TableCell>{row.branchName}</TableCell>
                    <TableCell>
                      {row.previousTeachers.length > 0
                        ? row.previousTeachers.join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {row.newTeachers.length > 0
                        ? row.newTeachers.join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {CHANGE_TYPE_LABELS[row.changeType]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.triggeredByDismissal ? (
                        <Badge variant="destructive">
                          Ustoz ishdan ketgan
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Oddiy o&apos;zgarish</Badge>
                      )}
                    </TableCell>
                    <TableCell>{row.changedBy ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogPaginationFooter
          isLoading={isLoading}
          total={total}
          page={clampedPage}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function DepartedAfterChangeDialog({
  open,
  onOpenChange,
  queryParams,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  queryParams: QueryParams;
}) {
  const { data, isLoading } = useQuery<DepartedAfterChangeRow[]>({
    queryKey: ["departed-after-change", queryParams],
    queryFn: () =>
      api
        .get<DepartedAfterChangeRow[]>(
          "/reports/departed-students/departed-after-change",
          { params: queryParams },
        )
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    if (open) setPage(1);
  }, [open]);

  const total = data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pagedData = useMemo(
    () =>
      data?.slice((clampedPage - 1) * pageSize, clampedPage * pageSize) ?? [],
    [data, clampedPage, pageSize],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(1200px,95vw)] w-[min(1200px,95vw)] max-h-[85vh] overflow-hidden flex flex-col gap-4 p-6">
        <DialogHeader>
          <DialogTitle>
            O&apos;zgarishdan keyin ketgan o&apos;quvchilar
          </DialogTitle>
          <DialogDescription>
            Ustoz almashgandan so&apos;ng 5 dars ichida guruhdan chiqib ketgan
            o&apos;quvchilar
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40">
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>O&apos;quvchi</TableHead>
                <TableHead>Guruh</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Ustoz almashgan sana</TableHead>
                <TableHead>Oldingi → Yangi ustoz</TableHead>
                <TableHead>Ketgan sana</TableHead>
                <TableHead>N-dars</TableHead>
                <TableHead>Ketish sababi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j} className={j === 0 ? "border-r" : ""}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data || data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center py-16 text-muted-foreground"
                  >
                    Ma&apos;lumot yo&apos;q
                  </TableCell>
                </TableRow>
              ) : (
                pagedData.map((row, i) => (
                  <TableRow key={row.enrollmentId}>
                    <TableCell className="border-r text-muted-foreground">
                      {(clampedPage - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.studentName}
                    </TableCell>
                    <TableCell>{row.groupName}</TableCell>
                    <TableCell>{row.branchName}</TableCell>
                    <TableCell className="tabular-nums">
                      {format(new Date(row.teacherChangeAt), "dd.MM.yyyy")}
                    </TableCell>
                    <TableCell>
                      {(row.previousTeachers.join(", ") || "—") +
                        " → " +
                        (row.newTeachers.join(", ") || "—")}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {format(new Date(row.departedAt), "dd.MM.yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.lessonNumber}-dars</Badge>
                    </TableCell>
                    <TableCell>{row.departureReason ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogPaginationFooter
          isLoading={isLoading}
          total={total}
          page={clampedPage}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shared pagination footer for dialog tables — matches the main page-level
 * pagination pattern (CLAUDE.md: Pagination Rules → Dialog/drawer tables).
 */
function DialogPaginationFooter({
  isLoading,
  total,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  isLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
}) {
  return (
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
              onValueChange={(v) => onPageSizeChange(Number(v))}
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
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page <= 1 || isLoading}
          onClick={() => onPageChange(page - 1)}
          aria-label="Oldingi"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page >= totalPages || isLoading}
          onClick={() => onPageChange(page + 1)}
          aria-label="Keyingi"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
