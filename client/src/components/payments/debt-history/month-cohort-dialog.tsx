"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Info, Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DialogPaginationFooter } from "@/components/reports/departed-students/dialog-pagination-footer";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { markedText } from "./marked-text";
import { STATUS_COLORS } from "./types";
import { DebtMonthsBadge } from "../debt/debt-months-badge";
import { monthLabel } from "../salary-utils";
import type {
  AgingDebtor,
  DebtMonth,
  DebtStatusFilter,
  MonthAgingDetail,
} from "./types";

/**
 * Who still owes money that arose in ONE month.
 *
 * The «Keyin to'langan» tab is gone: a debt that was later paid is not a
 * problem and does not belong on a list of who owes. It also counted payment
 * ROWS beside a headcount, which read as "310 of the 352 paid" — a claim
 * nobody made. What is left is the people who have not paid, plus the debts
 * that were forgiven outright.
 */

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: msg("Faol"),
  INACTIVE: msg("Nofaol"),
  FROZEN: msg("Muzlatilgan"),
  GRADUATED: msg("Bitirgan"),
  EXPELLED: msg("Chetlatilgan"),
  ARCHIVED: msg("Arxivlangan"),
  PROSPECT: msg("Ro'yxatda"),
};

type TabKey = "debtors" | "writeoffs";

/** A known status in the page language; one the client does not know prints as the server sent it. */
function statusText(status: string, t: (source: string) => string): string {
  const label = STATUS_LABELS[status];
  return label ? t(label) : status;
}

function fmtDate(iso: string) {
  return format(new Date(iso), "dd.MM.yyyy");
}

/** A column header carrying a plain-language explanation. */
function HintHead({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TableHead className={className}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="inline-flex items-center gap-1 text-left">
            {label}
            <Info className="size-3.5 shrink-0 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-72 flex-col items-stretch">
            {children}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </TableHead>
  );
}

function StudentLink({
  id,
  firstName,
  lastName,
}: {
  id: number | null;
  firstName: string;
  lastName: string;
}) {
  const label = `${firstName} ${lastName}`.trim();
  if (id == null) return <span>{label}</span>;
  return (
    <Link
      href={`/students/profile/${id}`}
      className="font-medium hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-muted-foreground">#{id}</span> {label}
    </Link>
  );
}

interface Props {
  target: DebtMonth | null;
  statusFilter: DebtStatusFilter;
  onClose: () => void;
}

export function MonthCohortDialog({ target, statusFilter, onClose }: Props) {
  const t = useT();
  const open = target !== null;
  const [tab, setTab] = useState<TabKey>("debtors");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [tab, target?.monthKey]);
  useEffect(() => {
    if (open) setTab("debtors");
  }, [target?.monthKey, open]);

  const { data, isLoading } = useQuery({
    queryKey: ["month-debt-aging", target?.monthKey, statusFilter],
    queryFn: () =>
      api
        .get<MonthAgingDetail>(
          `/reports/monthly-debt-recovery/${target!.monthKey}/aging`,
          {
            params:
              statusFilter === "all" ? undefined : { status: statusFilter },
          },
        )
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  const list = useMemo<Array<AgingDebtor | MonthAgingDetail["writeOffs"][0]>>(
    () => (!data ? [] : tab === "debtors" ? data.debtors : data.writeOffs),
    [data, tab],
  );

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = list.slice(
    (clampedPage - 1) * pageSize,
    clampedPage * pageSize,
  );
  const cols = tab === "debtors" ? 7 : 6;
  const totals = data?.totals;
  const month = target ? monthLabel(target.monthKey, t) : "";
  // The sentence holds {badge} where the sample «N oy» chip goes.
  const [debtorsBefore, debtorsAfter = ""] = t(
    "Summalar faqat **{month}** oyiga tegishli — shu oyda o'tilgan darslardan hali to'lanmagani. Qarzi boshqa oylarga ham tarqalganlarda {badge} belgisi turadi.",
    { month },
  ).split("{badge}");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[88vh] w-[min(1040px,95vw)] !max-w-[min(1040px,95vw)] flex-col gap-4 overflow-hidden p-6">
        <DialogHeader className="space-y-2">
          <DialogTitle>{t("{month} — batafsil", { month })}</DialogTitle>
          {target && (
            <DialogDescription>
              {totals
                ? markedText(
                    t("{month} oyidan bugungi kunga qolgan qarz — **{amount}**, **{n}** ta o'quvchida.", {
                      month,
                      amount: `${formatPrice(totals.debt)} ${t("so'm")}`,
                      n: totals.debtorCount,
                    }),
                    "font-medium text-foreground",
                  )
                : t("{month} oyidan bugungi kunga qolgan qarz", { month })}
            </DialogDescription>
          )}
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid h-auto w-full grid-cols-2">
            <TabsTrigger value="debtors" className="flex-col gap-0.5 py-1.5">
              <span>{t("Qarzdorlar")}</span>
              <span className="text-[11px] font-normal opacity-70">
                {data ? t("{n} ta o'quvchi", { n: data.debtors.length }) : "—"}
              </span>
            </TabsTrigger>
            <TabsTrigger value="writeoffs" className="flex-col gap-0.5 py-1.5">
              <span>{t("Kechirilgan")}</span>
              <span className="text-[11px] font-normal opacity-70">
                {data ? t("{n} ta", { n: data.writeOffs.length }) : "—"}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            {tab === "debtors" ? (
              <>
                {markedText(debtorsBefore)}
                <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  {t("N oy")}
                </span>
                {markedText(debtorsAfter)}
              </>
            ) : (
              t("Shu oyda hisobdan chiqarilgan qarzlar — pul olinmagan. Ular yuqoridagi ro'yxatda yo'q, chunki bu qarz endi undirilmaydi.")
            )}
          </span>
        </div>

        {/* The ONLY scroll area */}
        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40">
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                {tab === "debtors" ? (
                  <>
                    <TableHead>{t("O'quvchi")}</TableHead>
                    <TableHead>{t("Telefon")}</TableHead>
                    <TableHead>{t("Guruh")}</TableHead>
                    <TableHead>{t("Holat")}</TableHead>
                    <HintHead
                      label={t("{month} qarzi", { month })}
                      className="text-right"
                    >
                      {t("Shu o'quvchining aynan shu oydan qolgan qarzi. Boshqa oylardagi qarzi bu raqamga kirmaydi.")}
                    </HintHead>
                    <HintHead label={t("Jami qarzi")} className="text-right">
                      {t("Shu o'quvchining bugungi umumiy qarzi — barcha oylar bo'yicha.")}
                    </HintHead>
                  </>
                ) : (
                  <>
                    <TableHead>{t("Sana")}</TableHead>
                    <TableHead>{t("O'quvchi")}</TableHead>
                    <TableHead className="text-right">{t("Summa")}</TableHead>
                    <TableHead>{t("Sabab")}</TableHead>
                    <TableHead>{t("Bajardi")}</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={cols}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : total === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={cols}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {tab === "debtors"
                      ? t("Bu oydan qolgan qarz yo'q — hammasi to'langan.")
                      : t("Bu oyda qarz kechirilmagan.")}
                  </TableCell>
                </TableRow>
              ) : tab === "debtors" ? (
                (pageRows as AgingDebtor[]).map((d, idx) => (
                  <TableRow key={d.id}>
                    <TableCell className="border-r tabular-nums text-muted-foreground">
                      {(clampedPage - 1) * pageSize + idx + 1}
                    </TableCell>
                    <TableCell>
                      <StudentLink
                        id={d.id}
                        firstName={d.firstName}
                        lastName={d.lastName}
                      />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {d.phone ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-36 truncate text-muted-foreground">
                      {d.groups.length ? d.groups.join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              STATUS_COLORS[d.status] ?? "#94a3b8",
                          }}
                        />
                        {statusText(d.status, t)}
                        {d.isArchived && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[10px] font-normal"
                          >
                            {t("arxiv")}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-red-600 dark:text-red-400">
                      {formatPrice(d.monthUnpaid)}
                      <DebtMonthsBadge
                        className="ml-1.5"
                        studentName={`${d.firstName} ${d.lastName}`.trim()}
                        months={[
                          ...d.otherMonths,
                          {
                            monthKey: target?.monthKey ?? "",
                            amount: d.monthUnpaid,
                          },
                        ]}
                        totalDebt={d.totalDebt}
                        highlightMonthKey={target?.monthKey}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatPrice(d.totalDebt)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                (pageRows as MonthAgingDetail["writeOffs"]).map((w, idx) => (
                  <TableRow key={w.id}>
                    <TableCell className="border-r tabular-nums text-muted-foreground">
                      {(clampedPage - 1) * pageSize + idx + 1}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {fmtDate(w.createdAt)}
                    </TableCell>
                    <TableCell>
                      <StudentLink
                        id={w.studentId}
                        firstName={w.firstName}
                        lastName={w.lastName}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatPrice(w.amount)}
                    </TableCell>
                    <TableCell
                      className="max-w-xs truncate text-muted-foreground"
                      title={w.reason ?? undefined}
                    >
                      {w.reason ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {w.performedBy ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogPaginationFooter
          isLoading={isLoading}
          total={total}
          page={clampedPage}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
