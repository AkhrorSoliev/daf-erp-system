"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MonthStepper } from "@/components/shared/month-stepper";
import { BlockError, BlockSkeleton } from "@/components/payments/overview/block-state";
import { clampMonth } from "@/components/payments/overview/overview-math";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { getErrorMessage } from "@/lib/get-error-message";
import { useLowRatings, useRatingSummary, useSetRatingEnabled } from "./queries";
import { RATING_FLOOR_MONTH } from "./rating-format";
import { RatingSummaryCards } from "./rating-summary-cards";
import { RatingTeachersTable } from "./rating-teachers-table";
import { RatingLowList } from "./rating-low-list";
import { TeacherRatingsPanel } from "./teacher-ratings-panel";

const FILTERS = {
  month: { type: "string" as const, defaultValue: "" },
  ustoz: { type: "number" as const, defaultValue: 0 },
};

/** «Dars baholari» (spec 2026-10-13 §6.3). Faqat CEO. */
export function LessonRatingsClient() {
  const { filters, setFilter } = useUrlFilters(FILTERS);
  const current = currentMonthKey();
  const month = clampMonth(filters.month || current, RATING_FLOOR_MONTH, current);
  const summary = useRatingSummary(month);
  const toggle = useSetRatingEnabled();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const lastPage = Math.max(1, Math.ceil((summary.data?.teachers.length ?? 0) / pageSize));
  const safePage = Math.min(page, lastPage);
  const openTeacher = filters.ustoz || null;
  const openName = summary.data?.teachers.find((t) => t.teacherId === openTeacher)?.name;

  const onToggle = (enabled: boolean) =>
    toggle.mutate(enabled, {
      onSuccess: (r) =>
        toast.success(r.enabled ? "Baho so'rash yoqildi" : "Baho so'rash o'chirildi"),
      onError: (e) => toast.error(getErrorMessage(e, "Sozlamani saqlab bo'lmadi")),
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Dars baholari</h2>
        <div className="flex flex-wrap items-center gap-4">
          {summary.data && (
            <div className="flex items-center gap-2">
              <Switch
                id="rating-enabled"
                checked={summary.data.enabled}
                disabled={toggle.isPending}
                onCheckedChange={onToggle}
              />
              <Label htmlFor="rating-enabled">
                Baho so&apos;rash: {summary.data.enabled ? "Yoqilgan" : "O'chirilgan"}
              </Label>
            </div>
          )}
          <MonthStepper
            value={month}
            min={RATING_FLOOR_MONTH}
            max={current}
            onChange={(m) => {
              setPage(1);
              setFilter("month", m === current ? "" : m);
            }}
          />
        </div>
      </div>

      {summary.isPending ? (
        <BlockSkeleton className="h-64" />
      ) : summary.isError ? (
        <BlockError title="Dars baholari" onRetry={() => summary.refetch()} />
      ) : (
        <>
          {!summary.data.enabled && (
            <p className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
              Hozir o&apos;quvchilardan baho so&apos;ralmayapti.
            </p>
          )}
          <RatingSummaryCards data={summary.data} onOpenTeacher={(id) => setFilter("ustoz", id)} />
          <section className="space-y-3">
            <h3 className="font-medium">Ustozlar</h3>
            <RatingTeachersTable
              rows={summary.data.teachers.slice((safePage - 1) * pageSize, safePage * pageSize)}
              page={safePage}
              pageSize={pageSize}
              total={summary.data.teachers.length}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
              onOpen={(id) => setFilter("ustoz", id)}
            />
          </section>
          <section className="space-y-3">
            <h3 className="font-medium">Past baholar (1–3)</h3>
            <RatingLowSection key={month} month={month} />
          </section>
        </>
      )}

      <Sheet open={openTeacher !== null} onOpenChange={(o) => !o && setFilter("ustoz", 0)}>
        <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{openName ?? "Ustoz baholari"}</SheetTitle>
            <SheetDescription className="sr-only">
              Ustozning oylar, guruhlar va izohlar bo&apos;yicha baholari
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {openTeacher !== null && <TeacherRatingsPanel teacherId={openTeacher} month={month} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Owns the low-ratings page; `key={month}` in the caller returns it to page 1. */
function RatingLowSection({ month }: { month: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const q = useLowRatings(month, page, pageSize);

  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <BlockError title="Past baholar" onRetry={() => q.refetch()} />;
  return (
    <RatingLowList
      rows={q.data.data}
      page={page}
      pageSize={pageSize}
      total={q.data.total}
      onPageChange={setPage}
      onPageSizeChange={(s) => {
        setPageSize(s);
        setPage(1);
      }}
    />
  );
}
