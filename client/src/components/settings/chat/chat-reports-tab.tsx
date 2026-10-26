"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/outreach/table-pagination";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { useChatReports } from "./chat-admin-queries";
import type { ChatReportRow } from "./chat-admin-types";
import { PersonLine, ReportStatusPill } from "./chat-report-parts";
import { ChatReportDrawer } from "./chat-report-drawer";
import { cleanHolat, formatReportDate, HOLAT_VALUES, statusFilterToParam } from "./chat-report-rules";

const SCHEMA = {
  holat: { type: "string", defaultValue: "ochiq" },
  shikoyat: { type: "string", defaultValue: "" },
} as const;

const CHIPS = [
  { value: "ochiq", label: msg("Ochiq") },
  { value: "hal-qilingan", label: msg("Hal qilingan") },
  { value: "rad-etilgan", label: msg("Rad etilgan") },
  { value: "hammasi", label: msg("Hammasi") },
] as const;

const EMPTY: Record<(typeof HOLAT_VALUES)[number], string> = {
  ochiq: msg("Ochiq shikoyat yo'q — yangi shikoyat kelganda qo'ng'iroqchada ko'rinadi"),
  "hal-qilingan": msg("Hal qilingan shikoyat hali yo'q — «Ochiq» bo'limidagi shikoyatlarni ko'rib chiqing"),
  "rad-etilgan": msg("Rad etilgan shikoyat hali yo'q — «Ochiq» bo'limidagi shikoyatlarni ko'rib chiqing"),
  hammasi: msg("Hali shikoyat kelmagan — o'quvchi shikoyat qilsa, shu yerda ko'rinadi"),
};
const LOAD_FAILED = msg("Shikoyatlarni yuklab bo'lmadi.");

export function ChatReportsTab() {
  const t = useT();
  const { filters, setFilters } = useUrlFilters(SCHEMA);
  const holat = cleanHolat(filters.holat);
  const { data, isError, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = useChatReports(
    statusFilterToParam(holat),
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rows = data?.pages.flatMap((p) => p.data);
  const lastPage = Math.max(1, Math.ceil((rows?.length ?? 0) / pageSize));
  const current = Math.min(page, lastPage);
  const slice = rows?.slice((current - 1) * pageSize, current * pageSize) ?? [];
  const emptyText = EMPTY[holat];

  const pickHolat = (value: string) => {
    setPage(1);
    setFilters({ holat: value, shikoyat: "" });
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("Holat")}>
        {CHIPS.map((chip) => (
          <Button
            key={chip.value}
            size="sm"
            variant={chip.value === holat ? "default" : "outline"}
            aria-pressed={chip.value === holat}
            onClick={() => pickHolat(chip.value)}
          >
            {t(chip.label)}
          </Button>
        ))}
      </div>

      {rows ? (
        rows.length === 0 ? (
          <p className="rounded-md border py-10 text-center text-sm text-muted-foreground">{t(emptyText)}</p>
        ) : (
          <ReportsTable rows={slice} offset={(current - 1) * pageSize} onOpen={(id) => setFilters({ shikoyat: id })} />
        )
      ) : isError ? (
        <div className="space-y-3 rounded-md border p-6 text-center">
          <p className="text-sm text-muted-foreground">{t(LOAD_FAILED)}</p>
          <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching && <Loader2 className="size-4 animate-spin" />}
            {t("Qayta urinish")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded" />
          ))}
        </div>
      )}

      {rows && rows.length > 0 && (
        <TablePagination
          total={rows.length}
          page={current}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      )}
      {hasNextPage && (
        <div className="text-center">
          <Button variant="outline" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage && <Loader2 className="size-4 animate-spin" />}
            {t("Yana ko'rsatish")}
          </Button>
        </div>
      )}

      <ChatReportDrawer
        id={filters.shikoyat || null}
        onClose={() => setFilters({ shikoyat: "" })}
      />
    </div>
  );
}

function ReportsTable({ rows, offset, onOpen }: { rows: ChatReportRow[]; offset: number; onOpen: (id: string) => void }) {
  const t = useT();
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>{t("Sana")}</TableHead>
            <TableHead>{t("Shikoyat qilgan")}</TableHead>
            <TableHead>{t("Shikoyat qilingan")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("Sabab")}</TableHead>
            <TableHead>{t("Holat")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow
              key={r.id}
              role="button"
              tabIndex={0}
              className="cursor-pointer"
              onClick={() => onOpen(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(r.id);
                }
              }}
            >
              <TableCell className="border-r text-muted-foreground">{offset + i + 1}</TableCell>
              <TableCell className="whitespace-nowrap">{formatReportDate(r.createdAt)}</TableCell>
              <TableCell><PersonLine person={{ ...r.reporter, chatBannedAt: null }} /></TableCell>
              <TableCell><PersonLine person={r.reported} /></TableCell>
              <TableCell className="hidden max-w-xs md:table-cell"><p className="line-clamp-2 whitespace-pre-wrap break-words">{r.reason}</p></TableCell>
              <TableCell><ReportStatusPill status={r.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
