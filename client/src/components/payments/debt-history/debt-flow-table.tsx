"use client";

import { ChevronRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import type { DebtHistoryResponse, DebtMonth } from "./types";

/**
 * Each month's OWN debt: how much debt that month created.
 *
 * It replaced a month-end-balance series, which could not answer the question
 * being asked. A frozen debtor showed the same cumulative figure under every
 * month (#10399 read 815 163 in both June and July), so "how much of this is
 * June's?" had no answer, and overlapping balances meant the «Jami» row had to
 * be left blank.
 *
 * Attributing each charge to the month it landed in fixes both: the buckets are
 * disjoint, so the column adds up, and a month means the same thing whether or
 * not the student is still being billed.
 *
 * The figure is deliberately the debt CREATED, not the part still unpaid — a
 * month's debt is a property of that month and must not shrink as people pay.
 * The unpaid remainder rides alongside it (`monthUnpaid`) and is what ties to
 * today's total, which the footnote states outright so 333 mln is never read as
 * money currently owed.
 */

/** A column header carrying an explanation, since none of these are obvious. */
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

interface Props {
  data: DebtHistoryResponse | undefined;
  isLoading: boolean;
  onSelectMonth: (month: DebtMonth) => void;
}

export function DebtFlowTable({ data, isLoading, onSelectMonth }: Props) {
  const months = data?.months ?? [];
  // The column sums to today's live debt by construction; using `current` makes
  // that identity visible instead of asserted, and keeps the row honest if a
  // bucket is ever dropped.
  const totalDebt = data?.current.debt ?? 0;
  const totalDebtors = data?.current.debtorCount ?? 0;

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-base font-semibold">Oylar bo&apos;yicha qarz</h2>
        <p className="text-sm text-muted-foreground">
          Har oy oxirida qancha qarz bo&apos;lgan. Kimlar ekanini ko&apos;rish
          uchun oyni bosing.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="min-w-32">Oy</TableHead>
              <HintHead label="Qarz" className="text-right">
                <span className="space-y-1.5">
                  <span className="block">
                    <b>Bugungi kunda</b> shu oydan qolgan qarz — o&apos;sha
                    oyda o&apos;tilgan, lekin hali ham to&apos;lanmagan
                    darslar.
                  </span>
                  <span className="block">
                    Keyin to&apos;langan qarz bu yerda qolmaydi. Shuning uchun
                    ustunlar bir-birini takrorlamaydi va qo&apos;shilganda
                    bugungi jami qarzni beradi.
                  </span>
                </span>
              </HintHead>
              <HintHead label="Qarzdorlar" className="text-right">
                <span className="space-y-1.5">
                  <span className="block">
                    Shu oy qarzi <b>hozir ham</b> yopilmagan o&apos;quvchilar
                    soni. To&apos;lab yuborganlar bu yerga kirmaydi.
                  </span>
                  <span className="block">
                    Bir o&apos;quvchining qarzi bir necha oyga tarqalgan
                    bo&apos;lishi mumkin, shuning uchun bu ustun
                    qo&apos;shilmaydi — «Jami» qatorida takrorsiz son turadi.
                  </span>
                </span>
              </HintHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-9 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : months.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Tanlangan kesimda ma&apos;lumot yo&apos;q — holat filtrini
                  kengaytirib ko&apos;ring.
                </TableCell>
              </TableRow>
            ) : (
              months.map((m, idx) => (
                <TableRow
                  key={m.monthKey}
                  className={cn("cursor-pointer", m.isCurrent && "bg-muted/30")}
                  onClick={() => onSelectMonth(m)}
                >
                  <TableCell className="border-r tabular-nums text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {m.label}
                      {m.isCurrent && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="h-4 px-1 text-[10px] font-normal text-sky-700 dark:text-sky-400"
                              >
                                hali tugamagan
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-64">
                              Oy hali tugamagan. Bu qatordagi raqam har kuni
                              o&apos;zgaradi; oy tugagach qotib qoladi.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {m.monthKey === "2026-05" && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="h-4 px-1 text-[10px] font-normal text-amber-700 dark:text-amber-400"
                              >
                                o&apos;tish davri
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-64">
                              Eski tizimdan yangisiga o&apos;tilgan oy. Bu
                              oydagi to&apos;lovlar to&apos;liq kiritilmagan,
                              shuning uchun raqamga boshqa oylar kabi ishonib
                              bo&apos;lmaydi.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-base font-semibold tabular-nums">
                    {m.monthUnpaid > 0 ? (
                      formatPrice(m.monthUnpaid)
                    ) : (
                      <span className="font-normal text-green-700 dark:text-green-400">
                        to&apos;liq yopilgan
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {m.agedDebtorCount > 0 ? `${m.agedDebtorCount} ta` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <ChevronRight className="size-4" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>

          {!isLoading && months.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell className="border-r" />
                <TableCell className="font-semibold">Jami</TableCell>
                {/* Headcount is the UNIQUE number, not the column sum: 204 of
                    the 450 debtors carry debt from more than one month, so
                    adding the per-month counts would report 659 people. */}
                <TableCell className="text-right text-base font-semibold tabular-nums">
                  {formatPrice(totalDebt)}
                </TableCell>
                {/* The UNIQUE headcount, not the column sum: 204 of the 450
                    debtors owe from more than one month, so adding the
                    per-month counts would report 659 people. */}
                <TableCell className="text-right font-semibold tabular-nums">
                  {totalDebtors} ta
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Jami{" "}
        <span className="font-medium text-foreground">
          {formatPrice(totalDebt)}
        </span>{" "}
        so&apos;m — bu tepadagi «Hozirgi qarz» bilan bir xil raqam, faqat
        oylarga bo&apos;lingan holda.
      </p>
    </div>
  );
}
