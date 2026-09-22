"use client";

import { Fragment } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CallCell } from "./call-cell";
import { answerText } from "./submission-format";
import {
  SubmissionActions,
  SubmissionName,
  SubmissionPhone,
  SubmittedAt,
  stopRowClick,
} from "./submission-cells";
import type { SubmissionFieldColumn, SubmissionRow } from "./types";

// Kutayotgan qator fon va qalin ism bilan ajraladi — chetdagi rangli chiziq emas.
const AWAITING_ROW =
  "bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30";

interface Props {
  rows: SubmissionRow[];
  columns: SubmissionFieldColumn[];
  loading: boolean;
  offset: number;
  onToggleCalled: (rowId: string, called: boolean) => Promise<boolean>;
  onOpenLead: (leadId: string) => void;
  onRestore: (row: SubmissionRow) => void;
}

export function ResponsesTable(props: Props) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-md border sm:block">
        <DesktopTable {...props} />
      </div>
      <div className="sm:hidden">
        <MobileList {...props} />
      </div>
    </>
  );
}

function openableLeadId(row: SubmissionRow): string | null {
  return row.lead && !row.lead.archived ? row.lead.id : null;
}

function DesktopTable({
  rows,
  columns,
  loading,
  offset,
  onToggleCalled,
  onOpenLead,
  onRestore,
}: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 border-r">#</TableHead>
          <TableHead>Ism familiya</TableHead>
          <TableHead>Telefon</TableHead>
          <TableHead>Manba</TableHead>
          <TableHead>Yuborildi</TableHead>
          <TableHead>Qo&apos;ng&apos;iroq</TableHead>
          {columns.map((c) => (
            <TableHead key={c.id}>{c.label}</TableHead>
          ))}
          <TableHead className="w-12 text-right">Amal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading
          ? Array.from({ length: 5 }, (_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={7 + columns.length}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ))
          : rows.map((row, index) => {
              const leadId = openableLeadId(row);
              return (
                <TableRow
                  key={row.id}
                  onClick={leadId ? () => onOpenLead(leadId) : undefined}
                  className={cn(
                    leadId && "cursor-pointer",
                    row.stage === "awaiting" && AWAITING_ROW,
                  )}
                >
                  <TableCell className="border-r text-muted-foreground">
                    {offset + index + 1}
                  </TableCell>
                  <TableCell className="max-w-64">
                    <SubmissionName row={row} />
                  </TableCell>
                  <TableCell>
                    <SubmissionPhone row={row} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.lead?.source?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <SubmittedAt iso={row.submittedAt} />
                  </TableCell>
                  <TableCell onClick={stopRowClick}>
                    <CallCell row={row} onToggle={onToggleCalled} />
                  </TableCell>
                  {columns.map((c) => (
                    <TableCell key={c.id} className="max-w-48 truncate">
                      {answerText(c, row.data[c.id]) || "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <SubmissionActions
                      row={row}
                      onOpenLead={onOpenLead}
                      onRestore={onRestore}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
      </TableBody>
    </Table>
  );
}

function MobileList({
  rows,
  columns,
  loading,
  onToggleCalled,
  onOpenLead,
  onRestore,
}: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  return (
    <ul className="divide-y rounded-md border">
      {rows.map((row) => {
        const leadId = openableLeadId(row);
        return (
          <li
            key={row.id}
            onClick={leadId ? () => onOpenLead(leadId) : undefined}
            className={cn("space-y-2 px-3 py-3", row.stage === "awaiting" && AWAITING_ROW)}
          >
            <div className="flex items-start justify-between gap-2">
              <SubmissionName row={row} />
              <SubmissionActions row={row} onOpenLead={onOpenLead} onRestore={onRestore} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <SubmissionPhone row={row} />
              <span>{row.lead?.source?.name ?? "Manbasiz"}</span>
              <SubmittedAt iso={row.submittedAt} />
            </div>
            {columns.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                {columns.map((c) => (
                  <Fragment key={c.id}>
                    <dt className="text-muted-foreground">{c.label}:</dt>
                    <dd>{answerText(c, row.data[c.id]) || "—"}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
            <div onClick={stopRowClick}>
              <CallCell row={row} onToggle={onToggleCalled} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
