"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { formatNumber } from "@/lib/format-utils";
import { useAttendanceMissers } from "./attendance-queries";
import { ATT_PAGE_SIZES, missersParams, type DayRange } from "./attendance-url";
import type { CutKey } from "./attendance-types";

export interface MisserTarget {
  key: string;
  name: string;
  cut: CutKey;
}

/** One cut row's «ko'p qoldiruvchi» list, loaded the first time it opens (spec §4). The page mounts it with `key` per row, so the page number resets. */
export function AttendanceMissersDialog({ target, range, onClose }: {
  target: MisserTarget | null;
  range: DayRange;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const params = target ? missersParams(range, target.cut, target.key, page, pageSize) : null;
  const { data, isPending, isPlaceholderData, isError, refetch } = useAttendanceMissers(params);
  // The server clamps a page past the end; follow its page (never from a placeholder answer).
  const serverPage = data && !isPlaceholderData ? data.page : null;
  useEffect(() => {
    if (serverPage !== null && serverPage !== page) setPage(serverPage);
  }, [serverPage, page]);

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[min(760px,95vw)] !max-w-[min(760px,95vw)] flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Ko&apos;p qoldiruvchilar — {target?.name}</DialogTitle>
          <DialogDescription>Tanlangan davrda 3 va undan ko&apos;p marta «Kelmadi» belgilangan o&apos;quvchilar.</DialogDescription>
        </DialogHeader>
        <div aria-live="polite" aria-busy={isPlaceholderData} className="min-h-0 flex-1 overflow-auto rounded-md border">
          {isError ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <p>Ro&apos;yxatni yuklab bo&apos;lmadi</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Qayta urinish</Button>
            </div>
          ) : isPending || !data ? (
            <div className="flex flex-col gap-2 p-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}
            </div>
          ) : (
            <Table aria-label="Ko'p qoldiruvchilar">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>O&apos;quvchi</TableHead>
                  <TableHead>Guruh</TableHead>
                  <TableHead className="text-right">Kelmadi</TableHead>
                  <TableHead className="text-right">Jami</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r, i) => (
                  <TableRow key={`${r.studentId}-${r.groupId}`}>
                    <TableCell className="border-r text-muted-foreground tabular-nums">{(data.page - 1) * data.pageSize + i + 1}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.groupName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.absent)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.lessons)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {data && (
          <PaymentsPager
            page={data.page} pageSize={data.pageSize} total={data.total}
            onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }}
            sizes={ATT_PAGE_SIZES} sizeLabel="Sahifadagi o'quvchilar soni"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
