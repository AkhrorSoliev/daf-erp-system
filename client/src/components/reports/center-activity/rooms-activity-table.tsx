"use client";

import { useState } from "react";
import { ChevronsLeftRight, Settings } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatBalance, formatPrice } from "@/lib/format-utils";
import {
  type CenterActivityRoom,
  formatPctValue,
  getFikColor,
  TABLE_TOOLTIPS,
} from "./metric-helpers";

interface Props {
  rooms: CenterActivityRoom[];
  isLoading: boolean;
  onEditRoom: (room: CenterActivityRoom) => void;
  onBulkEdit: () => void;
  canEdit: boolean;
}

const PAGE_SIZES = [10, 20, 30, 40, 50];

interface HeaderWithTooltipProps {
  label: string;
  tooltip: string;
  align?: "left" | "right";
}

function HeaderWithTooltip({ label, tooltip, align = "left" }: HeaderWithTooltipProps) {
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

function renderGroupCount(
  groups: CenterActivityRoom["groups"],
): React.ReactNode {
  if (groups.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted tabular-nums">
          {groups.length} ta
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-0.5 text-xs">
          {groups.map((g) => (
            <div key={g.id}>
              {g.name}{" "}
              <span className="text-muted-foreground">
                — {g.enrolled} o&apos;quvchi
              </span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function renderPriceRange(
  groups: CenterActivityRoom["groups"],
): React.ReactNode {
  if (groups.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const unique = Array.from(
    new Set(groups.map((g) => g.coursePrice).filter((p) => p > 0)),
  ).sort((a, b) => a - b);
  if (unique.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (unique.length === 1) {
    return formatPrice(unique[0]);
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted tabular-nums">
          {formatPrice(unique[0])} — {formatPrice(unique[unique.length - 1])}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5 text-xs">
          {unique.map((p) => (
            <div key={p}>{formatPrice(p)} so&apos;m</div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function RoomsActivityTable({
  rooms,
  isLoading,
  onEditRoom,
  onBulkEdit,
  canEdit,
}: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const total = rooms.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = rooms.slice(start, start + pageSize);

  // Default view: # + 7 data columns (Xona, Sig'im, Guruhlar, O'quvchilar,
  // Bo'sh o'rin, Bo'sh vaqt, FIK %) + optional edit action.
  // Advanced toggle reveals 7 more (Ish vaqti, Dars soatlari, Kurs narxi,
  // Jami summa, plus the three seat-hour columns that feed the FIK formula).
  const defaultColCount = 8 + (canEdit ? 1 : 0);
  const advancedColCount = 7;
  const totalColCount = defaultColCount + (showAdvanced ? advancedColCount : 0);

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-3">
        <div>
          <h3 className="font-semibold">Xonalar bo&apos;yicha tafsilot</h3>
          <p className="text-xs text-muted-foreground">
            Har bir xonaning sig&apos;imi, dars vaqti va bandligi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced((s) => !s)}
            className="gap-2"
            aria-pressed={showAdvanced}
          >
            <ChevronsLeftRight className="size-4" />
            {showAdvanced
              ? "Texnik ustunlarni yashirish"
              : "Texnik ustunlarni ko'rsatish"}
          </Button>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkEdit}
              className="gap-2"
            >
              <Settings className="size-4" />
              Xonalar sig&apos;imini sozlash
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader className="[&_th]:border-r [&_th:last-child]:border-r-0 [&_th]:bg-muted/40">
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Xona</TableHead>
              <TableHead className="text-right">
                <HeaderWithTooltip
                  label="Sig'im"
                  tooltip={TABLE_TOOLTIPS.capacity}
                  align="right"
                />
              </TableHead>
              {showAdvanced && (
                <TableHead className="text-right">
                  <HeaderWithTooltip
                    label="Ish vaqti"
                    tooltip={TABLE_TOOLTIPS.workingHours}
                    align="right"
                  />
                </TableHead>
              )}
              <TableHead className="text-right">
                <HeaderWithTooltip
                  label="Guruhlar"
                  tooltip={TABLE_TOOLTIPS.groups}
                  align="right"
                />
              </TableHead>
              <TableHead className="text-right">
                <HeaderWithTooltip
                  label="O'quvchilar"
                  tooltip={TABLE_TOOLTIPS.enrolled}
                  align="right"
                />
              </TableHead>
              <TableHead className="text-right">
                <HeaderWithTooltip
                  label="Bo'sh o'rin"
                  tooltip={TABLE_TOOLTIPS.emptySeats}
                  align="right"
                />
              </TableHead>
              {showAdvanced && (
                <TableHead className="text-right">
                  <HeaderWithTooltip
                    label="Dars soatlari"
                    tooltip={TABLE_TOOLTIPS.lessonHours}
                    align="right"
                  />
                </TableHead>
              )}
              {showAdvanced && (
                <TableHead className="text-right">
                  <HeaderWithTooltip
                    label="Kurs narxi"
                    tooltip={TABLE_TOOLTIPS.coursePrice}
                    align="right"
                  />
                </TableHead>
              )}
              {showAdvanced && (
                <TableHead className="text-right">
                  <HeaderWithTooltip
                    label="Jami summa"
                    tooltip={TABLE_TOOLTIPS.totalRevenue}
                    align="right"
                  />
                </TableHead>
              )}
              <TableHead className="text-right">
                <HeaderWithTooltip
                  label="Bo'sh vaqt"
                  tooltip={TABLE_TOOLTIPS.idleTime}
                  align="right"
                />
              </TableHead>
              {showAdvanced && (
                <TableHead className="text-right">
                  <HeaderWithTooltip
                    label="O'rinsoat"
                    tooltip={TABLE_TOOLTIPS.seatHoursScheduled}
                    align="right"
                  />
                </TableHead>
              )}
              {showAdvanced && (
                <TableHead className="text-right">
                  <HeaderWithTooltip
                    label="Amaldagi o'rinsoat"
                    tooltip={TABLE_TOOLTIPS.seatHoursActual}
                    align="right"
                  />
                </TableHead>
              )}
              {showAdvanced && (
                <TableHead className="text-right">
                  <HeaderWithTooltip
                    label="Reja o'rinsoat"
                    tooltip={TABLE_TOOLTIPS.seatHoursPlanned}
                    align="right"
                  />
                </TableHead>
              )}
              <TableHead className="text-right">
                <HeaderWithTooltip
                  label="FIK %"
                  tooltip={TABLE_TOOLTIPS.fik}
                  align="right"
                />
              </TableHead>
              {canEdit && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={totalColCount}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!isLoading && slice.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={totalColCount}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  Tanlangan filtrlar bo&apos;yicha xonalar topilmadi
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              slice.map((r, i) => {
                const num = start + i + 1;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {num}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.branchName}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.capacity ?? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help text-muted-foreground">
                              —
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Sig&apos;im belgilanmagan
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    {showAdvanced && (
                      <TableCell className="text-right tabular-nums">
                        {r.workingHoursPerWeek} soat
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      {renderGroupCount(r.groups)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.totals.enrolled}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.totals.emptySeats}
                    </TableCell>
                    {showAdvanced && (
                      <TableCell className="text-right tabular-nums">
                        {r.totals.lessonHoursPerWeek} soat
                      </TableCell>
                    )}
                    {showAdvanced && (
                      <TableCell className="text-right tabular-nums">
                        {renderPriceRange(r.groups)}
                      </TableCell>
                    )}
                    {showAdvanced && (
                      <TableCell className="text-right tabular-nums">
                        {formatBalance(r.totals.revenueSum)}
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">
                      {r.totals.idleHoursPerWeek} soat
                    </TableCell>
                    {showAdvanced && (
                      <TableCell className="text-right tabular-nums">
                        {r.totals.seatHoursCapacityScheduled ?? "—"}
                      </TableCell>
                    )}
                    {showAdvanced && (
                      <TableCell className="text-right tabular-nums">
                        {r.totals.seatHoursActual}
                      </TableCell>
                    )}
                    {showAdvanced && (
                      <TableCell className="text-right tabular-nums">
                        {r.totals.seatHoursPlanned ?? "—"}
                      </TableCell>
                    )}
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-medium",
                        getFikColor(r.totals.fikPct),
                      )}
                    >
                      {formatPctValue(r.totals.fikPct)}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onEditRoom(r)}
                              className="h-8 w-8"
                              aria-label="Sig'imni o'zgartirish"
                            >
                              <Settings className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Sig&apos;imni o&apos;zgartirish
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3 p-4 pt-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
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
            onClick={() => setPage(safePage - 1)}
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
            onClick={() => setPage(safePage + 1)}
          >
            Keyingi
          </Button>
        </div>
      </div>
    </div>
  );
}
