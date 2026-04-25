"use client";

import { useState } from "react";
import { ChevronsRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  formatValue,
  getFieldLabel,
  truncateValue,
  VALUE_MAX_LENGTH,
  type HistoryRecord,
} from "./entity-history-utils";

export function HistorySkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell className="border-r">
            <Skeleton className="h-4 w-5" />
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-3.5 w-28" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function ChangedFields({ record }: { record: HistoryRecord }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { action, oldValues, newValues } = record;

  let entries: [string, unknown][] = [];
  let mode: "create" | "delete" | "restore" | "diff" = "create";
  let hasLongValue = false;

  if (action === "CREATE" && newValues) {
    entries = Object.entries(newValues).filter(
      ([key, val]) =>
        getFieldLabel(key) !== null &&
        val !== null &&
        val !== undefined &&
        val !== "",
    );
    mode = "create";
  } else if (action === "DELETE" && oldValues) {
    entries = Object.entries(oldValues).filter(
      ([key]) => getFieldLabel(key) !== null,
    );
    mode = "delete";
  } else if (
    (action === "UPDATE" || action === "STATUS_CHANGE") &&
    oldValues &&
    newValues
  ) {
    entries = Object.keys(newValues)
      .filter((key) => getFieldLabel(key) !== null)
      .map((key) => [key, newValues[key]]);
    mode = "diff";
  } else if (action === "RESTORE" && newValues) {
    entries = Object.entries(newValues).filter(
      ([key]) => getFieldLabel(key) !== null,
    );
    mode = "restore";
  }

  if (entries.length === 0) {
    if (action === "DELETE")
      return <span className="text-xs text-muted-foreground">Arxivlandi</span>;
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  hasLongValue = entries.some(([key, val]) => {
    if (mode === "diff" && oldValues) {
      return (
        formatValue(val).length > VALUE_MAX_LENGTH ||
        formatValue(oldValues[key]).length > VALUE_MAX_LENGTH
      );
    }
    return formatValue(val).length > VALUE_MAX_LENGTH;
  });

  const shownEntries = mode === "create" ? entries.slice(0, 3) : entries;

  const getGroupId = (values: Record<string, unknown> | null) =>
    values?.guruhId as string | undefined;

  const getStudentId = (values: Record<string, unknown> | null) =>
    values?.oquvchiId as number | undefined;

  const renderEntityLink = (text: string, href?: string) =>
    href ? (
      <a
        href={href}
        className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {text}
      </a>
    ) : (
      <span className="font-medium">{text}</span>
    );

  const renderRow = (key: string, val: unknown, full: boolean) => {
    const label = getFieldLabel(key);
    const v = full
      ? { text: formatValue(val), truncated: false }
      : truncateValue(val);

    if (mode === "diff" && oldValues) {
      const ov = full
        ? { text: formatValue(oldValues[key]), truncated: false }
        : truncateValue(oldValues[key]);

      if (key === "guruh") {
        const gid = getGroupId(newValues);
        return (
          <div key={key} className="text-xs">
            <span className="text-muted-foreground">{label}:</span>{" "}
            <span className="text-red-500 line-through">{ov.text}</span>
            {" → "}
            {renderEntityLink(v.text, gid ? `/groups/${gid}` : undefined)}
          </div>
        );
      }

      return (
        <div key={key} className="text-xs">
          <span className="text-muted-foreground">{label}:</span>{" "}
          <span className="text-red-500 line-through">{ov.text}</span>
          {" → "}
          <span className="font-medium text-green-600">{v.text}</span>
        </div>
      );
    }

    if (key === "guruh") {
      const gid = getGroupId(mode === "delete" ? oldValues : newValues);
      return (
        <div key={key} className="text-xs">
          <span className="text-muted-foreground">{label}:</span>{" "}
          {renderEntityLink(v.text, gid ? `/groups/${gid}` : undefined)}
        </div>
      );
    }

    if (key === "oquvchi") {
      const sid = getStudentId(mode === "delete" ? oldValues : newValues);
      return (
        <div key={key} className="text-xs">
          <span className="text-muted-foreground">{label}:</span>{" "}
          {renderEntityLink(
            v.text,
            sid ? `/students/profile/${sid}` : undefined,
          )}
        </div>
      );
    }

    return (
      <div key={key} className="text-xs">
        <span className="text-muted-foreground">{label}:</span>{" "}
        <span
          className={`font-medium ${mode === "restore" ? "text-green-600" : ""}`}
        >
          {v.text}
        </span>
      </div>
    );
  };

  return (
    <>
      <div className="space-y-0.5">
        {shownEntries.map(([key, val]) => renderRow(key, val, false))}
        {mode === "create" && entries.length > 3 && (
          <span className="text-[10px] text-muted-foreground">
            +{entries.length - 3} ta maydon
          </span>
        )}
        {hasLongValue && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline mt-0.5"
          >
            To&apos;liq o&apos;qish
            <ChevronsRight className="size-3" />
          </button>
        )}
      </div>

      {hasLongValue && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>O&apos;zgarishlar tafsiloti</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-96 overflow-y-auto py-2">
              {entries.map(([key, val]) => renderRow(key, val, true))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
