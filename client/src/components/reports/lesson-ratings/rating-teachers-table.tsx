"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/forms/table-pagination";
import { cn } from "@/lib/utils";
import type { RatingTeacherRow } from "./types";
import { averageText, responseText, trend } from "./rating-format";

export function RatingTeachersTable({
  rows,
  onOpen,
}: {
  rows: RatingTeacherRow[];
  onOpen: (teacherId: number) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);

  if (rows.length === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Bu oyda baho yo&apos;q — tizim yoqilganini va darslar o&apos;tganini tekshiring
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>Ustoz</TableHead>
            <TableHead>O&apos;rtacha</TableHead>
            <TableHead>Baholar</TableHead>
            <TableHead>Javob ulushi</TableHead>
            <TableHead>Past (1–3)</TableHead>
            <TableHead>O&apos;tgan oyga nisbatan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.map((r, i) => {
            const t = trend(r.average, r.previousAverage);
            return (
              <TableRow
                key={r.teacherId}
                className="cursor-pointer"
                tabIndex={0}
                onClick={() => onOpen(r.teacherId)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(r.teacherId)}
              >
                <TableCell className="border-r text-muted-foreground">
                  {(page - 1) * pageSize + i + 1}
                </TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{averageText(r.average)}</TableCell>
                <TableCell>{r.rated}</TableCell>
                <TableCell>{responseText(r.rated, r.delivered, r.responseRate)}</TableCell>
                <TableCell className={cn(r.low > 0 && "text-destructive")}>{r.low}</TableCell>
                <TableCell
                  className={cn(
                    t?.tone === "up" && "text-green-600",
                    t?.tone === "down" && "text-destructive",
                  )}
                >
                  {t?.text ?? "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <TablePagination
        page={page}
        pageSize={pageSize}
        total={rows.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
      />
    </div>
  );
}
