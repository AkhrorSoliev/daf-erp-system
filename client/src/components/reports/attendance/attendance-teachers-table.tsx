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
  type AttendanceTeacherRow,
  type SortOrder,
  type TeacherSortBy,
} from "./metric-helpers";

const PAGE_SIZES = [10, 20, 30, 40, 50];

interface Props {
  teachers: AttendanceTeacherRow[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: TeacherSortBy;
  sortOrder: SortOrder;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (sortBy: TeacherSortBy, sortOrder: SortOrder) => void;
}

interface HeaderTooltipProps {
  label: string;
  tooltip: string;
  align?: "left" | "right" | "center";
}

function HeaderWithTooltip({ label, tooltip, align = "left" }: HeaderTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4",
            align === "right" && "block text-right",
            align === "center" && "block text-center",
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
  align?: "right" | "center";
}

function SortHeader({
  label,
  tooltip,
  active,
  order,
  onToggle,
  align = "right",
}: SortHeaderProps) {
  const Icon = !active ? ArrowUpDown : order === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground transition-colors",
        align === "right" && "ml-auto",
        align === "center" && "mx-auto",
      )}
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

export function AttendanceTeachersTable({
  teachers,
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

  const handleSort = (col: TeacherSortBy) => {
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
              <TableHead>O&apos;qituvchi</TableHead>
              <TableHead className="text-right">
                <SortHeader
                  label="Guruhlar"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.groupsCount}
                  active={sortBy === "groupsCount"}
                  order={sortOrder}
                  onToggle={() => handleSort("groupsCount")}
                />
              </TableHead>
              <TableHead className="text-right hidden md:table-cell">
                <HeaderWithTooltip
                  label="Boshi"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.startStudentCount}
                  align="right"
                />
              </TableHead>
              <TableHead className="text-right">
                <HeaderWithTooltip
                  label="Yakun"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.endStudentCount}
                  align="right"
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
                  <TableCell colSpan={6}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : teachers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  Tanlangan davrda davomat ma&apos;lumotlari yo&apos;q
                </TableCell>
              </TableRow>
            ) : (
              teachers.map((t, i) => {
                const num = (safePage - 1) * pageSize + i + 1;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="border-r text-muted-foreground tabular-nums">
                      {num}
                    </TableCell>
                    <TableCell className="font-medium">
                      {t.firstName} {t.lastName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.groupsCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden md:table-cell text-muted-foreground">
                      {t.startStudentCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.endStudentCount}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-semibold",
                        getRetentionColor(t.retentionPct),
                      )}
                    >
                      {t.retentionPct === null
                        ? "—"
                        : formatAttendancePct(t.retentionPct)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-semibold",
                        getAttendanceColor(t.averageAttendance),
                      )}
                    >
                      {formatAttendancePct(t.averageAttendance)}
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
