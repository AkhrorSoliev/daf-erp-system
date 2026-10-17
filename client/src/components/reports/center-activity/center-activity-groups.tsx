"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CanLink } from "@/components/shared/can-link";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { scheduleText } from "./center-activity-format";
import { CA_PAGE_SIZES } from "./center-activity-url";
import type { GroupRow } from "./center-activity-types";

/** «Bo'sh o'rni bor guruhlar» (spec B7b §4): the server sends only groups with free seats, most free first. */
export function CenterActivityGroups({ groups }: { groups: GroupRow[] }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // A list that shrank under the open page (a new month) never shows an empty page.
  const p = Math.min(page, Math.max(1, Math.ceil(groups.length / pageSize)));
  const slice = groups.slice((p - 1) * pageSize, p * pageSize);
  return (
    <Card className="min-w-0">
      <CardContent className="flex flex-col gap-2 p-4">
        <h3 className="font-medium">Bo&apos;sh o&apos;rni bor guruhlar</h3>
        <Table className="min-w-[34rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Guruh</TableHead>
              <TableHead>Jadval</TableHead>
              <TableHead className="text-right">O&apos;quvchi / o&apos;rin</TableHead>
              <TableHead className="text-right">Bo&apos;sh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Bo&apos;sh o&apos;rni bor guruh yo&apos;q
                </TableCell>
              </TableRow>
            ) : (
              slice.map((g, i) => (
                <TableRow key={g.id}>
                  <TableCell className="border-r text-muted-foreground">{(p - 1) * pageSize + i + 1}</TableCell>
                  <TableCell>
                    {g.name}
                    <span className="ml-1 text-xs text-muted-foreground">{g.courseName}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{scheduleText(g)}</TableCell>
                  <TableCell className="text-right">{g.enrolled} / {g.capacity}</TableCell>
                  <TableCell className="text-right"><b>{g.free}</b></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaymentsPager
          page={p} pageSize={pageSize} total={groups.length}
          onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }}
          sizes={CA_PAGE_SIZES} sizeLabel="Sahifadagi guruhlar soni"
        />
        <CanLink perm="students.list" href="/students?status=ungrouped" className="text-sm" linkClassName="text-primary hover:underline">
          Guruhsiz o&apos;quvchilarni joylashtirish →
        </CanLink>
      </CardContent>
    </Card>
  );
}
