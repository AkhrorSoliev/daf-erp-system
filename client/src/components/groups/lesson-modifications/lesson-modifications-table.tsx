"use client";

import { format } from "date-fns";
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  LessonModificationRow,
  LessonRescheduleRow,
} from "./aggregate";

export type LessonModificationCreateKind =
  | "cancellation"
  | "override"
  | "reschedule";

export interface LessonModificationsTableProps {
  rows: LessonModificationRow[];
  isLoading: boolean;
  canCreate: boolean;
  canDelete: boolean;
  /** Fired when the admin picks a "+ Add ..." menu item. */
  onCreate: (kind: LessonModificationCreateKind) => void;
  onEditReschedule: (reschedule: LessonRescheduleRow) => void;
  onDeleteReschedule: (id: string) => void;
  onDeleteOverride: (id: string) => void;
  onDeleteCancellation: (id: string) => void;
  /** While a row is being deleted we show a spinner on its dropdown trigger. */
  busyRowKey?: string | null;
}

export function LessonModificationsTable({
  rows,
  isLoading,
  canCreate,
  canDelete,
  onCreate,
  onEditReschedule,
  onDeleteReschedule,
  onDeleteOverride,
  onDeleteCancellation,
  busyRowKey,
}: LessonModificationsTableProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Dars o&apos;zgarishlari</h2>
        {canCreate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus className="size-4 mr-1" />
                Yangi o&apos;zgarish
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Qaysi turdagi o&apos;zgarish?
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onCreate("reschedule")}>
                Boshqa kunga ko&apos;chirish
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreate("override")}>
                O&apos;rinbosar ustoz
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreate("cancellation")}>
                Bekor qilish
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm py-4 text-center">
          Hech qanday o&apos;zgarish yo&apos;q
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="w-32">Sana</TableHead>
              <TableHead className="w-56">Turi</TableHead>
              <TableHead>Tafsilot</TableHead>
              <TableHead className="w-44">Belgilagan</TableHead>
              {(canCreate || canDelete) && (
                <TableHead className="w-16">Amal</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={row.dateKey}>
                <TableCell className="border-r text-muted-foreground">
                  {i + 1}
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  {format(row.date, "dd.MM.yyyy")}
                </TableCell>
                <TableCell>
                  <RowBadges row={row} />
                </TableCell>
                <TableCell className="text-sm">
                  <RowDetails row={row} />
                </TableCell>
                <TableCell className="text-sm">
                  {row.latestActor.firstName} {row.latestActor.lastName}
                  {row.latestAt && (
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(row.latestAt), "dd.MM.yyyy, HH:mm")}
                    </div>
                  )}
                </TableCell>
                {(canCreate || canDelete) && (
                  <TableCell>
                    <RowActions
                      row={row}
                      canCreate={canCreate}
                      canDelete={canDelete}
                      busy={busyRowKey === row.dateKey}
                      onEditReschedule={onEditReschedule}
                      onDeleteReschedule={onDeleteReschedule}
                      onDeleteOverride={onDeleteOverride}
                      onDeleteCancellation={onDeleteCancellation}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function RowBadges({ row }: { row: LessonModificationRow }) {
  return (
    <div className="flex flex-wrap gap-1">
      {row.cancellation && (
        <Badge variant="destructive" className="font-normal">
          Bekor qilingan
        </Badge>
      )}
      {row.reschedule && (
        <Badge
          variant="outline"
          className="border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 font-normal"
        >
          Ko&apos;chirilgan
        </Badge>
      )}
      {row.override && (
        <Badge
          variant="outline"
          className="border-blue-500/40 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 font-normal"
        >
          O&apos;rinbosar
        </Badge>
      )}
    </div>
  );
}

function RowDetails({ row }: { row: LessonModificationRow }) {
  const parts: string[] = [];
  if (row.reschedule) {
    const r = row.reschedule;
    const fromStr = format(new Date(r.originalDate), "dd.MM.yyyy");
    const tail: string[] = [];
    if (r.newRoom?.name) tail.push(r.newRoom.name);
    if (r.newLessonStartTime && r.newLessonEndTime) {
      tail.push(`${r.newLessonStartTime}–${r.newLessonEndTime}`);
    }
    parts.push(
      `Ko'chirildi: ${fromStr} → bu kun${tail.length ? ` (${tail.join(", ")})` : ""}`,
    );
    if (r.reason) parts.push(`Sabab: ${r.reason}`);
  }
  if (row.override) {
    parts.push(
      `O'rinbosar ustoz(lar): ${row.override.teacherIds.length} ta tayinlangan`,
    );
    if (row.override.reason) parts.push(`Sabab: ${row.override.reason}`);
  }
  if (row.cancellation) {
    parts.push(`Sabab: ${row.cancellation.reason}`);
  }
  if (parts.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="space-y-0.5">
      {parts.map((p, i) => (
        <div key={i}>{p}</div>
      ))}
    </div>
  );
}

interface RowActionsProps {
  row: LessonModificationRow;
  canCreate: boolean;
  canDelete: boolean;
  busy: boolean;
  onEditReschedule: (reschedule: LessonRescheduleRow) => void;
  onDeleteReschedule: (id: string) => void;
  onDeleteOverride: (id: string) => void;
  onDeleteCancellation: (id: string) => void;
}

function RowActions({
  row,
  canCreate,
  canDelete,
  busy,
  onEditReschedule,
  onDeleteReschedule,
  onDeleteOverride,
  onDeleteCancellation,
}: RowActionsProps) {
  const hasEditableReschedule = !!row.reschedule && canCreate;
  const hasDeletes =
    canDelete && (row.reschedule || row.override || row.cancellation);

  if (!hasEditableReschedule && !hasDeletes) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MoreHorizontal className="size-4" />
          )}
          <span className="sr-only">Amallar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasEditableReschedule && (
          <DropdownMenuItem onClick={() => onEditReschedule(row.reschedule!)}>
            <Pencil className="mr-2 size-4" />
            Ko&apos;chirishni tahrirlash
          </DropdownMenuItem>
        )}
        {hasEditableReschedule && hasDeletes && <DropdownMenuSeparator />}
        {canDelete && row.reschedule && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDeleteReschedule(row.reschedule!.id)}
          >
            <Trash2 className="mr-2 size-4" />
            Ko&apos;chirishni o&apos;chirish
          </DropdownMenuItem>
        )}
        {canDelete && row.override && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDeleteOverride(row.override!.id)}
          >
            <Trash2 className="mr-2 size-4" />
            O&apos;rinbosarni o&apos;chirish
          </DropdownMenuItem>
        )}
        {canDelete && row.cancellation && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDeleteCancellation(row.cancellation!.id)}
          >
            <Trash2 className="mr-2 size-4" />
            Bekor qilishni o&apos;chirish
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
