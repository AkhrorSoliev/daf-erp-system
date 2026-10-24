"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRolePermissionsHistory } from "@/hooks/use-role-permissions";
import { useT } from "@/i18n/context";
import { tashkentDayAsLocalDate, tashkentHhmm } from "@/lib/tashkent-time";
import { historyLine } from "./permissions-model";
import type { PermissionsOverview } from "./permissions-types";

// "dd.MM.yyyy, HH:mm" on the Tashkent clock, never the browser's zone.
const when = (iso: string) =>
  `${format(tashkentDayAsLocalDate(iso), "dd.MM.yyyy")}, ${tashkentHhmm(iso)}`;

function HeadRow() {
  const t = useT();
  return (
    <TableRow>
      <TableHead className="w-12 border-r">#</TableHead>
      <TableHead className="w-40">{t("Sana")}</TableHead>
      <TableHead className="w-44">{t("Kim")}</TableHead>
      <TableHead>{t("O'zgarish")}</TableHead>
    </TableRow>
  );
}

/** «O'zgarishlar tarixi»: who changed which role, newest first, 20 per page (spec §7.8). */
export function PermissionsHistory({ overview }: { overview: PermissionsOverview }) {
  const t = useT();
  const [page, setPage] = useState(1);
  const { data, isError, isFetching, refetch } = useRolePermissionsHistory(page);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t("O'zgarishlar tarixi")}</h3>

      {isError && !data ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>{t("Tarixni yuklab bo'lmadi.")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            {t("Qayta urinish")}
          </Button>
        </div>
      ) : !data ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <HeadRow />
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell className="border-r">
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-64" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : data.data.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border text-sm text-muted-foreground">
          {t("Hali o'zgarish yo'q")}
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <HeadRow />
              </TableHeader>
              <TableBody>
                {data.data.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {(data.page - 1) * data.pageSize + index + 1}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {when(item.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.changedBy
                        ? `${item.changedBy.firstName} ${item.changedBy.lastName}`
                        : t("Tizim (avtomatik)")}
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {historyLine(overview, item, t)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{t("Jami: {n} ta yozuv", { n: data.total })}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t("Oldingi")}
                </Button>
                <span>
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("Keyingi")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
