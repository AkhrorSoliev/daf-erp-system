"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { formatNumber } from "@/lib/format-utils";
import { pctText } from "./center-activity-format";
import { CA_PAGE_SIZES } from "./center-activity-url";
import type { RoomRow } from "./center-activity-types";

/** «Xonalar» (spec B7b §4). The server sends every room; the page only slices it. */
export function CenterActivityRooms({ rooms, showBranch }: { rooms: RoomRow[]; showBranch: boolean }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // A list that shrank under the open page (a new month) never shows an empty page.
  const p = Math.min(page, Math.max(1, Math.ceil(rooms.length / pageSize)));
  const slice = rooms.slice((p - 1) * pageSize, p * pageSize);
  return (
    <Card className="min-w-0">
      <CardContent className="flex flex-col gap-2 p-4">
        <h3 className="font-medium">Xonalar</h3>
        <Table className="min-w-[30rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Xona</TableHead>
              <TableHead className="text-right">O&apos;rin</TableHead>
              <TableHead className="text-right">Guruh</TableHead>
              <TableHead>Bandligi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell className="border-r text-muted-foreground">{(p - 1) * pageSize + i + 1}</TableCell>
                <TableCell>
                  {r.name}
                  {showBranch && <span className="ml-1 text-xs text-muted-foreground">{r.branchName}</span>}
                </TableCell>
                <TableCell className="text-right">{r.capacity ?? "—"}</TableCell>
                <TableCell className="text-right">{r.groupCount}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, r.occupancyPct ?? 0)}%` }} />
                    </div>
                    <span className="whitespace-nowrap text-sm">
                      {pctText(r.occupancyPct)} · {formatNumber(r.lessonHours)} soat
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <PaymentsPager
          page={p} pageSize={pageSize} total={rooms.length}
          onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }}
          sizes={CA_PAGE_SIZES} sizeLabel="Sahifadagi xonalar soni"
        />
      </CardContent>
    </Card>
  );
}
