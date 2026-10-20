"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PlayCircle, PauseCircle, SlidersHorizontal } from "lucide-react";
import api from "@/lib/api";
import { useT } from "@/i18n/context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DialogPaginationFooter } from "@/components/reports/departed-students/dialog-pagination-footer";
import {
  actorName,
  describeEntry,
  formatStamp,
  type AbsencePauseHistoryPage,
  type HistoryKind,
} from "./absence-pause-history";

export const HISTORY_KEY = ["absence-pause", "history"] as const;

/** Karta ham, panel ham shu so'rovni o'qiydi: bir xil kalit — bitta javob. */
export function useAbsencePauseHistory(page: number, pageSize: number, enabled = true) {
  return useQuery({
    queryKey: [...HISTORY_KEY, page, pageSize],
    enabled,
    queryFn: () =>
      api
        .get<AbsencePauseHistoryPage>("/absence-pause/history", { params: { page, pageSize } })
        .then((r) => r.data),
  });
}

const ICON: Record<HistoryKind, typeof PlayCircle> = {
  on: PlayCircle,
  off: PauseCircle,
  edit: SlidersHorizontal,
};

const ICON_TONE: Record<HistoryKind, string> = {
  on: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  off: "bg-muted text-muted-foreground",
  edit: "bg-muted text-muted-foreground",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * To'liq o'zgarish tarixi. Ro'yxat sahifada emas, shu yon panelda: uzun
 * bo'lsa sahifa cho'zilmaydi; sarlavha va sahifalash qotib turadi, faqat
 * o'rtasi aylanadi.
 */
export function AbsencePauseHistorySheet({ open, onOpenChange }: Props) {
  const t = useT();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { data, isLoading, isError, isFetching, refetch } = useAbsencePauseHistory(
    page,
    pageSize,
    open,
  );

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-4 py-4 pr-12">
          <SheetTitle>{t("O'zgarish tarixi")}</SheetTitle>
          <SheetDescription>{t("Avtomatik pauza sozlamasini kim va qachon o'zgartirgan")}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {isError ? (
            <div className="space-y-3 py-6">
              <p className="text-sm text-muted-foreground">{t("Tarixni yuklab bo'lmadi.")}</p>
              <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
                {isFetching && <Loader2 className="size-4 animate-spin" />}
                {t("Qayta urinish")}
              </Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-4 py-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : total === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {t("Hali o'zgarish yo'q. Sozlama saqlangach, shu yerda ko'rinadi.")}
            </p>
          ) : (
            <ul className="divide-y">
              {data?.data.map((entry) => {
                const line = describeEntry(entry, t);
                const Icon = ICON[line.kind];
                return (
                  <li key={entry.id} className="flex gap-3 py-3">
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-full ${ICON_TONE[line.kind]}`}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t(line.title)}</p>
                      {line.detail && (
                        <p className="text-xs text-muted-foreground">{line.detail}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {actorName(entry, t)} · {formatStamp(entry.createdAt, true)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t px-4 py-3">
          <DialogPaginationFooter
            isLoading={isLoading}
            total={total}
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
