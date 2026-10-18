"use client";

import { History, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { PILL_BASE } from "@/components/payments/list/payments-table";
import { ADVANCE_NOTE, dateText, enteredText } from "./expenses-format";
import { EXPENSE_CATEGORY_LABELS, EXPENSE_HINT_LABELS, EXPENSE_METHOD_LABELS } from "./expenses-labels";
import type { ExpenseRow } from "./expenses-types";

const HEADS = ["#", "Sana", "Turkum", "Tavsif", "Summa", "To'lov turi", "Kim kiritgan", ""];

/** «⋯» (spec B6 §3.1): Tahrirlash and O'chirish need `expenses.manage`; Tarix is `expenses.view`. */
export function rowActions(canManage: boolean): readonly ("edit" | "history" | "delete")[] {
  return canManage ? ["edit", "history", "delete"] : ["history"];
}

/** The table (spec B6 §3.6). `rows: undefined` or `loading` = skeleton rows. */
export function ExpensesTable({ rows, loading, offset, emptyMonth, canManage, onEdit, onHistory, onDelete, onClear, stale = false }: {
  rows: ExpenseRow[] | undefined;
  loading: boolean;
  /** (page − 1) × pageSize, for the `#` column. */
  offset: number;
  /** No filter is set: an empty answer means the month has nothing. */
  emptyMonth: boolean;
  canManage: boolean;
  onEdit: (row: ExpenseRow) => void;
  onHistory: (row: ExpenseRow) => void;
  onDelete: (row: ExpenseRow) => void;
  /** Given when a filter is set: the empty state offers to clear it. */
  onClear?: () => void;
  /** The rows are a previous answer (keepPreviousData): dimmed and inert, never drawn as current. */
  stale?: boolean;
}) {
  const actions = rowActions(canManage);
  // A kept previous answer is never drawn as current: an empty one is a skeleton too.
  const skeleton = loading || !rows || (stale && rows.length === 0);
  return (
    <div className="space-y-2">
      {!skeleton && rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          {emptyMonth ? (
            <p>Bu oyda xarajat yozilmagan</p>
          ) : (
            <>
              <p>Bu tanlovda xarajat yo&apos;q</p>
              {onClear && <Button variant="outline" size="sm" className="mt-3" onClick={onClear}>Tozalash</Button>}
            </>
          )}
        </div>
      ) : (
        <div aria-busy={stale} inert={stale} className={cn("rounded-md border", stale && "pointer-events-none opacity-60")}>
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                {HEADS.map((h, i) => (
                  <TableHead key={i} className={i === 0 ? "w-12 border-r" : h === "Summa" ? "text-right" : i === HEADS.length - 1 ? "w-12" : undefined}>
                    {h || <span className="sr-only">Amallar</span>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {skeleton || !rows
                ? Array.from({ length: 6 }, (_, i) => (
                    <TableRow key={i}>
                      {HEADS.map((_, j) => <TableCell key={j} className={j === 0 ? "border-r" : undefined}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                : rows.map((e, i) => (
                    <TableRow key={e.id}>
                      <TableCell className="border-r text-muted-foreground tabular-nums">{offset + i + 1}</TableCell>
                      <TableCell className="text-sm tabular-nums">{dateText(e.date)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{EXPENSE_CATEGORY_LABELS[e.category]}</Badge>
                        {e.leadSource && <span className="mt-0.5 block text-xs text-muted-foreground">{e.leadSource.name}</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {e.description}
                        {e.hint && <span className={cn(PILL_BASE, "ml-2 bg-amber-500/25 align-middle text-foreground")}>{EXPENSE_HINT_LABELS[e.hint]}</span>}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatPrice(e.amount)} so&apos;m</TableCell>
                      <TableCell className="text-sm">{EXPENSE_METHOD_LABELS[e.paymentMethod]}</TableCell>
                      <TableCell className="text-sm">
                        <span>{e.createdBy.firstName} {e.createdBy.lastName}</span>
                        <span className="block text-xs text-muted-foreground">{enteredText(e.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Amallar</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {actions.includes("edit") && (
                              <DropdownMenuItem onClick={() => onEdit(e)}><Pencil className="mr-2 size-4" />Tahrirlash</DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => onHistory(e)}><History className="mr-2 size-4" />Tarix</DropdownMenuItem>
                            {actions.includes("delete") && (
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(e)}>
                                <Trash2 className="mr-2 size-4" />O&apos;chirish
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{ADVANCE_NOTE}</p>
    </div>
  );
}
