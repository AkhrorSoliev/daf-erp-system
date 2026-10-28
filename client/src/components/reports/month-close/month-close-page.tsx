"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Info, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriceInput } from "@/components/ui/price-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MonthStepper } from "@/components/shared/month-stepper";
import { BlockError } from "@/components/payments/overview/block-state";
import { som } from "@/components/payments/overview/overview-math";
import { currentMonthKey, monthLabel } from "@/components/payments/salary-utils";
import { useCan, usePermissionsReady } from "@/hooks/use-permissions";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useT } from "@/i18n/context";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { MONTH_CLOSE_FIRST_MONTH, bankFeeBody, checklistRows, closeMonth, pictureRows } from "./month-close-model";
import { useMonthClose, useSaveBankFees } from "./month-close-queries";
import type { MonthCloseView } from "./month-close-types";

const FILTERS = { oy: { type: "string" as const, defaultValue: "" } };

function CardSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-48 rounded-xl", className)} />;
}

function Hint({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label={text} className="text-muted-foreground hover:text-foreground">
            <Info className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** «{Oy} surati»: the server's figures as one list, then the two figures that are only information. */
function PictureCard({ view, month }: { view: MonthCloseView; month: string }) {
  const t = useT();
  const taxes = view.netProfit.taxes;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("{oy} surati", { oy: monthLabel(month, t) })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y text-sm">
          {pictureRows(view, t).map((row, i, all) => {
            const last = i === all.length - 1;
            return (
              <li key={row.label} className={cn("flex justify-between gap-3 py-2", last && "font-semibold")}>
                <span className={last ? undefined : "text-muted-foreground"}>{row.label}</span>
                <span className="tabular-nums">{som(row.amount, t)}</span>
              </li>
            );
          })}
        </ul>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {t("Ushlangan soliq (xodimniki, ma'lumot): {amount}", { amount: som(taxes.withholding, t) })}
            <Hint text={t("Xodimning o'z solig'i oyligidan ushlanadi; sof foydadan ayrilmaydi.")} />
          </span>
          <span>{t("Bankdan berilgan oylik: {amount}", { amount: som(taxes.bankPaidSalary, t) })}</span>
        </p>
      </CardContent>
    </Card>
  );
}

/** «Bank xarajati»: one amount per bank account, saved together. Drafts hold only what the person typed. */
function BankFeesCard({ view, month, drafts, onDraft, onSaved }: {
  view: MonthCloseView;
  month: string;
  drafts: Record<string, string>;
  onDraft: (id: string, value: string) => void;
  onSaved: () => void;
}) {
  const t = useT();
  const save = useSaveBankFees(month);
  const body = bankFeeBody(view.bankAccounts, drafts);

  async function submit() {
    try {
      await save.mutateAsync(body);
      toast.success(t("Saqlandi"));
      onSaved();
    } catch (e) {
      toast.error(getErrorMessage(e, t("Saqlashda xatolik yuz berdi")));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("Bank xarajati")}
          <Hint text={t("Bank hisobidan olingan xizmat haqi: oy tugagach bank ko'chirmasidan kiritiladi.")} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!view.ended && (
          <Alert>
            <CircleAlert />
            <AlertDescription>{t("Joriy oy hali tugamagan — bank xarajati oy tugagach kiritiladi")}</AlertDescription>
          </Alert>
        )}
        {view.bankAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Bank hisobi yo'q")}</p>
        ) : (
          <ul className="space-y-4">
            {view.bankAccounts.map((a) => (
              <li key={a.id} className="grid gap-2 sm:grid-cols-[1fr_16rem] sm:items-start">
                <div className="text-sm">
                  <p className="font-medium">{a.name}</p>
                  <p className="text-muted-foreground">{a.branchName}</p>
                </div>
                <div className="space-y-1">
                  <PriceInput
                    aria-label={`${a.name}, ${a.branchName}`}
                    value={drafts[a.id] ?? (a.amount === null ? "" : String(a.amount))}
                    onChange={(e) => onDraft(a.id, e.target.value)}
                    disabled={!view.ended || save.isPending}
                  />
                  {a.amount !== null && (
                    <p className="text-xs text-muted-foreground">{t("Saqlangan: {amount}", { amount: som(a.amount, t) })}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button onClick={submit} disabled={!view.ended || body.items.length === 0 || save.isPending}>
          {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {t("Saqlash")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** «Tekshiruv»: what is still open before the month can be called closed. */
function ChecklistCard({ view }: { view: MonthCloseView }) {
  const t = useT();
  const rows = checklistRows(view, t);
  const allOk = rows.every((r) => r.ok);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Tekshiruv")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.text} className="flex items-start gap-2">
              {r.ok ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              )}
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
        {allOk && <p className="text-sm font-medium text-green-700 dark:text-green-400">{t("Oy hisobi to'liq")}</p>}
      </CardContent>
    </Card>
  );
}

/** «Oyni yopish» (spec 2026-10-28 §5): the month's picture, the bank fee entry and the checklist. Every figure is the server's. */
export function MonthClosePage() {
  const t = useT();
  const ready = usePermissionsReady();
  const allowed = useCan("settings.tax");
  const { filters, setFilter } = useUrlFilters(FILTERS);
  const current = currentMonthKey();
  const month = closeMonth(filters.oy, current);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const query = useMonthClose(month, allowed);

  function changeMonth(next: string) {
    setDrafts({});
    // The default month (the previous one) stays out of the URL.
    setFilter("oy", next === closeMonth("", current) ? "" : next);
  }

  if (!ready) return <CardSkeleton className="h-64" />;
  if (!allowed) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground" role="alert">
        {t("Bu sahifaga ruxsatingiz yo'q")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">{t("Oyni yopish")}</h2>
        <MonthStepper value={month} min={MONTH_CLOSE_FIRST_MONTH} max={current} onChange={changeMonth} />
      </div>
      {query.isPending ? (
        <div className="space-y-4">
          <CardSkeleton className="h-80" />
          <CardSkeleton />
          <CardSkeleton className="h-32" />
        </div>
      ) : query.isError ? (
        <BlockError title={t("Oyni yopish")} onRetry={() => query.refetch()} />
      ) : (
        <div className="space-y-4">
          <PictureCard view={query.data} month={month} />
          <BankFeesCard view={query.data} month={month} drafts={drafts}
            onDraft={(id, value) => setDrafts((d) => ({ ...d, [id]: value }))} onSaved={() => setDrafts({})} />
          <ChecklistCard view={query.data} />
        </div>
      )}
    </div>
  );
}
