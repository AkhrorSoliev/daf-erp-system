"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/forms/table-pagination";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { formatNumber } from "@/lib/format-utils";
import type { RatingTeacherRow } from "./types";
import { averageText, responseText, trend } from "./rating-format";

export function RatingTeachersTable({
  rows,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  onOpen,
}: {
  /** Already the current page's slice. */
  rows: RatingTeacherRow[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onOpen: (teacherId: number) => void;
}) {
  const t = useT();
  if (total === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        {t("Bu oyda baho yo'q — tizim yoqilganini va darslar o'tganini tekshiring")}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>{t("Ustoz")}</TableHead>
            <TableHead>{t("O'rtacha")}</TableHead>
            <TableHead>{t("Baholar")}</TableHead>
            <TableHead>{t("Javob ulushi")}</TableHead>
            <TableHead>{t("Past (1–3)")}</TableHead>
            <TableHead>{t("Izohlar")}</TableHead>
            <TableHead>{t("O'tgan oyga nisbatan")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const tr = trend(r.average, r.previousAverage, t);
            return (
              <TableRow
                key={r.teacherId}
                tabIndex={0}
                aria-label={t("{name} — baholarni ochish", { name: r.name })}
                className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onOpen(r.teacherId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(r.teacherId);
                  }
                }}
              >
                <TableCell className="border-r text-muted-foreground">
                  {(page - 1) * pageSize + i + 1}
                </TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{averageText(r.average)}</TableCell>
                <TableCell>{formatNumber(r.rated)}</TableCell>
                <TableCell>{responseText(r.rated, r.delivered, r.responseRate)}</TableCell>
                <TableCell className={cn(r.low > 0 && "text-destructive")}>{formatNumber(r.low)}</TableCell>
                <TableCell>{formatNumber(r.commented)}</TableCell>
                <TableCell
                  className={cn(
                    tr?.tone === "up" && "text-green-600",
                    tr?.tone === "down" && "text-destructive",
                  )}
                >
                  {tr?.text ?? "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <TablePagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
