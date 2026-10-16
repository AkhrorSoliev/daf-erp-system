"use client";

import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/forms/table-pagination";
import type { LowRating } from "./types";
import { dayText } from "./rating-format";

export function RatingLowList({
  rows,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  rows: LowRating[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  if (total === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Bu oyda 1–3 baho yo&apos;q
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>Sana</TableHead>
            <TableHead>Guruh</TableHead>
            <TableHead>Ustoz</TableHead>
            <TableHead>O&apos;quvchi</TableHead>
            <TableHead>Baho</TableHead>
            <TableHead>Izoh</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id}>
              <TableCell className="border-r text-muted-foreground">
                {(page - 1) * pageSize + i + 1}
              </TableCell>
              <TableCell>{dayText(r.date)}</TableCell>
              <TableCell>
                <Link href={`/groups/${r.groupId}`} className="hover:underline">
                  {r.groupName}
                </Link>
              </TableCell>
              <TableCell>{r.teacherNames.join(", ") || "—"}</TableCell>
              <TableCell>
                <Link href={`/students/profile/${r.studentId}`} className="hover:underline">
                  {r.studentName}
                </Link>
              </TableCell>
              <TableCell className="text-destructive">{r.score} ⭐</TableCell>
              <TableCell className="max-w-xs whitespace-normal text-sm">{r.comment ?? "—"}</TableCell>
            </TableRow>
          ))}
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
