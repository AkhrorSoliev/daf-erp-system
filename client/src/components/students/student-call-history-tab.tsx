"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/outreach/table-pagination";
import api from "@/lib/api";
import { useT } from "@/i18n/context";
import {
  CALL_OUTCOME_INFO,
  CALL_REASON_INFO,
  type CallLogItem,
  type CallLogsResponse,
} from "@/components/outreach/outreach-types";

export function StudentCallHistoryTab({ studentId }: { studentId: number }) {
  const t = useT();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ["call-logs", "student", studentId, page, pageSize],
    queryFn: () =>
      api
        .get<CallLogsResponse>("/call-logs", {
          params: { studentId, page, pageSize },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 rounded-md border p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if ((data?.items.length ?? 0) === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border">
        <p className="text-sm text-muted-foreground">
          {t("Qo'ng'iroq tarixi mavjud emas")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>{t("Sana / vaqt")}</TableHead>
              <TableHead>{t("Sabab")}</TableHead>
              <TableHead>{t("Natija")}</TableHead>
              <TableHead>{t("Izoh")}</TableHead>
              <TableHead>{t("Kim qo'ng'iroq qildi")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.items.map((row, idx) => (
              <Row key={row.id} row={row} index={(page - 1) * pageSize + idx} />
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePagination
        total={data!.total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
      />
    </div>
  );
}

function Row({ row, index }: { row: CallLogItem; index: number }) {
  const t = useT();
  const reason = CALL_REASON_INFO[row.reason];
  const outcome = CALL_OUTCOME_INFO[row.outcome];
  return (
    <TableRow>
      <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
      <TableCell className="text-sm">
        {format(new Date(row.createdAt), "dd.MM.yyyy, HH:mm")}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={`${reason.className} hover:${reason.className}`}>
          {t(reason.label)}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={`${outcome.className} hover:${outcome.className}`}>
          {t(outcome.label)}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
        {row.note || "—"}
      </TableCell>
      <TableCell className="text-sm">
        {row.calledBy.firstName} {row.calledBy.lastName}
      </TableCell>
    </TableRow>
  );
}
