"use client";

import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MonthStepper } from "@/components/shared/month-stepper";
import { BlockError, BlockSkeleton } from "@/components/payments/overview/block-state";
import { clampMonth } from "@/components/payments/overview/overview-math";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { useRatingSummary, useSetRatingEnabled } from "./queries";
import { RATING_FLOOR_MONTH, averageText, responseText, trend } from "./rating-format";
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
            onChange={(m) => setFilter("month", m === current ? "" : m)}
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
          <SummaryCards data={summary.data} />
          <section className="space-y-3">
            <h3 className="font-medium">Ustozlar</h3>
            <RatingTeachersTable
              rows={summary.data.teachers}
              onOpen={(id) => setFilter("ustoz", id)}
            />
          </section>
          <section className="space-y-3">
            <h3 className="font-medium">Past baholar (1–3)</h3>
            <RatingLowList key={month} month={month} />
          </section>
        </>
      )}

      <Sheet open={openTeacher !== null} onOpenChange={(o) => !o && setFilter("ustoz", 0)}>
        <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{openName ?? "Ustoz baholari"}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {openTeacher !== null && <TeacherRatingsPanel teacherId={openTeacher} month={month} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryCards({ data }: { data: NonNullable<ReturnType<typeof useRatingSummary>["data"]> }) {
  const t = trend(data.totals.average, data.previousAverage);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">O&apos;rtacha baho</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{averageText(data.totals.average)}</p>
          {t && (
            <p
              className={cn(
                "text-xs",
                t.tone === "up" && "text-green-600",
                t.tone === "down" && "text-destructive",
              )}
            >
              {t.text} — o&apos;tgan oyga nisbatan
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Javob berganlar</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">
            {responseText(data.totals.rated, data.totals.delivered, data.totals.responseRate)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Past baholar (1–3)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={cn("text-2xl font-semibold", data.totals.low > 0 && "text-destructive")}>
            {data.totals.low}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
