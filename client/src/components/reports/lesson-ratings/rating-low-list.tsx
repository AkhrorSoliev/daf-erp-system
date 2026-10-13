"use client";

import { useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TablePagination } from "@/components/forms/table-pagination";
import { BlockError } from "@/components/payments/overview/block-state";
import { useLowRatings } from "./queries";
import { dayText } from "./rating-format";

export function RatingLowList({ month }: { month: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const q = useLowRatings(month, page, pageSize);

  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <BlockError title="Past baholar" onRetry={() => q.refetch()} />;
  if (q.data.total === 0) {
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
          {q.data.data.map((r, i) => (
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
        total={q.data.total}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
      />
    </div>
  );
}
