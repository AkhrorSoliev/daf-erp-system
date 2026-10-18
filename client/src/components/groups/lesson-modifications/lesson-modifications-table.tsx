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
import { useT } from "@/i18n/context";
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
  const t = useT();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("Dars o'zgarishlari")}</h2>
        {canCreate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus className="size-4 mr-1" />
                {t("Yangi o'zgarish")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("Qaysi turdagi o'zgarish?")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onCreate("reschedule")}>
                {t("Boshqa kunga ko'chirish")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreate("override")}>
                {t("O'rinbosar ustoz")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreate("cancellation")}>
                {t("Bekor qilish")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm py-4 text-center">
          {t("Hech qanday o'zgarish yo'q")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="w-32">{t("Sana")}</TableHead>
              <TableHead className="w-56">{t("Turi")}</TableHead>
              <TableHead>{t("Tafsilot")}</TableHead>
              <TableHead className="w-44">{t("Belgilagan")}</TableHead>
              {(canCreate || canDelete) && (
                <TableHead className="w-16">{t("Amal")}</TableHead>
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
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1">
      {row.cancellation && (
        <Badge variant="destructive" className="font-normal">
          {t("Bekor qilingan")}
        </Badge>
      )}
      {row.reschedule && (
        <Badge
          variant="outline"
          className="border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 font-normal"
        >
          {t("Ko'chirilgan")}
        </Badge>
      )}
      {row.override && (
        <Badge
          variant="outline"
          className="border-blue-500/40 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 font-normal"
        >
          {t("O'rinbosar")}
        </Badge>
      )}
    </div>
  );
}

function RowDetails({ row }: { row: LessonModificationRow }) {
  const t = useT();
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
      tail.length
        ? t("Ko'chirildi: {from} → bu kun ({details})", { from: fromStr, details: tail.join(", ") })
        : t("Ko'chirildi: {from} → bu kun", { from: fromStr }),
    );
    if (r.reason) parts.push(t("Sabab: {reason}", { reason: r.reason }));
  }
  if (row.override) {
    parts.push(
      t("O'rinbosar ustoz(lar): {n} ta tayinlangan", { n: row.override.teacherIds.length }),
    );
    if (row.override.reason) parts.push(t("Sabab: {reason}", { reason: row.override.reason }));
  }
  if (row.cancellation) {
    parts.push(t("Sabab: {reason}", { reason: row.cancellation.reason }));
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
  const t = useT();
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
          <span className="sr-only">{t("Amallar")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasEditableReschedule && (
          <DropdownMenuItem onClick={() => onEditReschedule(row.reschedule!)}>
            <Pencil className="mr-2 size-4" />
            {t("Ko'chirishni tahrirlash")}
          </DropdownMenuItem>
        )}
        {hasEditableReschedule && hasDeletes && <DropdownMenuSeparator />}
        {canDelete && row.reschedule && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDeleteReschedule(row.reschedule!.id)}
          >
            <Trash2 className="mr-2 size-4" />
            {t("Ko'chirishni o'chirish")}
          </DropdownMenuItem>
        )}
        {canDelete && row.override && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDeleteOverride(row.override!.id)}
          >
            <Trash2 className="mr-2 size-4" />
            {t("O'rinbosarni o'chirish")}
          </DropdownMenuItem>
        )}
        {canDelete && row.cancellation && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDeleteCancellation(row.cancellation!.id)}
          >
            <Trash2 className="mr-2 size-4" />
            {t("Bekor qilishni o'chirish")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
