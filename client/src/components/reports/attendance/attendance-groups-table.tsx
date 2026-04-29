"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_TABLE_TOOLTIPS,
  formatAttendancePct,
  getAttendanceColor,
  getRetentionColor,
  type AttendanceGroupRow,
  type GroupSortBy,
  type SortOrder,
} from "./metric-helpers";

const PAGE_SIZES = [10, 20, 30, 40, 50];

interface Props {
  groups: AttendanceGroupRow[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: GroupSortBy;
  sortOrder: SortOrder;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (sortBy: GroupSortBy, sortOrder: SortOrder) => void;
}

interface HeaderTooltipProps {
  label: string;
  tooltip: string;
  align?: "left" | "right";
}

function HeaderWithTooltip({
  label,
  tooltip,
  align = "left",
}: HeaderTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4",
            align === "right" && "block text-right",
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-line">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

interface SortHeaderProps {
  label: string;
  tooltip: string;
  active: boolean;
  order: SortOrder;
  onToggle: () => void;
}

function SortHeader({
  label,
  tooltip,
  active,
  order,
  onToggle,
}: SortHeaderProps) {
  const Icon = !active ? ArrowUpDown : order === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="ml-auto inline-flex items-center gap-1 hover:text-foreground transition-colors"
    >
      <HeaderWithTooltip label={label} tooltip={tooltip} />
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          active ? "text-foreground" : "text-muted-foreground/50",
        )}
      />
    </button>
  );
}

function teachersDisplay(
  teachers: AttendanceGroupRow["teachers"],
): React.ReactNode {
  if (teachers.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (teachers.length === 1) {
    const t = teachers[0];
    return `${t.firstName} ${t.lastName}`;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted">
          {teachers.length} ta
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-0.5 text-xs">
          {teachers.map((t) => (
            <div key={t.id}>
              {t.firstName} {t.lastName}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function AttendanceGroupsTable({
  groups,
  total,
  page,
  pageSize,
  sortBy,
  sortOrder,
  isLoading,
  onPageChange,
  onPageSizeChange,
  onSortChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const handleSort = (col: GroupSortBy) => {
    if (sortBy === col) {
      onSortChange(col, sortOrder === "asc" ? "desc" : "asc");
    } else {
      onSortChange(col, col === "rate" ? "asc" : "desc");
    }
  };

  return (
    <div className="rounded-lg border">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Guruh</TableHead>
              <TableHead className="hidden md:table-cell">Filial</TableHead>
              <TableHead className="hidden md:table-cell">Kurs</TableHead>
              <TableHead className="hidden lg:table-cell">
                O&apos;qituvchi
              </TableHead>
              <TableHead className="text-right hidden md:table-cell">
                <HeaderWithTooltip
                  label="Boshi"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.startStudentCount}
                  align="right"
                />
              </TableHead>
              <TableHead className="text-right">
                <SortHeader
                  label="Yakun"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.endStudentCount}
                  active={sortBy === "studentCount"}
                  order={sortOrder}
                  onToggle={() => handleSort("studentCount")}
                />
              </TableHead>
              <TableHead className="text-right">
                <SortHeader
                  label="Qoldi %"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.retention}
                  active={sortBy === "retention"}
                  order={sortOrder}
                  onToggle={() => handleSort("retention")}
                />
              </TableHead>
              <TableHead className="text-right hidden md:table-cell">
                <SortHeader
                  label="Darslar"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.lessonCount}
                  active={sortBy === "lessonCount"}
                  order={sortOrder}
                  onToggle={() => handleSort("lessonCount")}
                />
              </TableHead>
              <TableHead className="text-right">
                <SortHeader
                  label="Davomat"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.rate}
                  active={sortBy === "rate"}
                  order={sortOrder}
                  onToggle={() => handleSort("rate")}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="border-r">
                    <Skeleton className="h-4 w-6" />
                  </TableCell>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : groups.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center text-muted-foreground py-8"
                >
                  Tanlangan filtrlar bo&apos;yicha guruhlar topilmadi
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g, i) => {
                const num = (safePage - 1) * pageSize + i + 1;
                return (
                  <TableRow key={g.groupId}>
                    <TableCell className="border-r text-muted-foreground tabular-nums">
                      {num}
                    </TableCell>
                    <TableCell className="font-medium">{g.groupName}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {g.branchName}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {g.courseName}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {teachersDisplay(g.teachers)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden md:table-cell text-muted-foreground">
                      {g.startStudentCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {g.endStudentCount}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-semibold",
                        getRetentionColor(g.retentionPct),
                      )}
                    >
                      {g.retentionPct === null
                        ? "—"
                        : formatAttendancePct(g.retentionPct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden md:table-cell">
                      {g.lessonCount}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-semibold",
                        getAttendanceColor(g.attendanceRate),
                      )}
                    >
                      {formatAttendancePct(g.attendanceRate)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 p-4 pt-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Sahifada:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              onPageSizeChange(Number(v));
              onPageChange(1);
            }}
          >
            <SelectTrigger className="h-8 w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>Jami: {total}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            Oldingi
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {safePage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            Keyingi
          </Button>
        </div>
      </div>
    </div>
  );
}
