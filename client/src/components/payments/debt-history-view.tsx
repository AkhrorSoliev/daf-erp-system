"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Info, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import api from "@/lib/api";
import { formatPrice, formatPercent } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { MonthDebtDetailDialog } from "./month-debt-detail-dialog";

interface DebtMonth {
  monthKey: string;
  label: string;
  closingDebt: number;
  debtorCount: number;
  recovered: number;
  writtenOff: number;
  remaining: number;
  recoveryRate: number;
}
interface DebtRecoveryResponse {
  months: DebtMonth[];
  totals: {
    closingDebt: number;
    recovered: number;
    writtenOff: number;
    remaining: number;
  };
}

/** A column header with an info tooltip. */
function HeadWithHint({
  label,
  hint,
  className,
}: {
  label: string;
  hint: string;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="inline-flex items-center gap-1">
            {label}
            <Info className="size-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{hint}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </TableHead>
  );
}

export function DebtHistoryView() {
  const { data, isLoading } = useQuery({
    queryKey: ["monthly-debt-recovery"],
    queryFn: () =>
      api
        .get<DebtRecoveryResponse>("/reports/monthly-debt-recovery")
        .then((r) => r.data),
    staleTime: 0,
  });

  const months = data?.months ?? [];
  const totals = data?.totals;

  const [target, setTarget] = useState<{
    monthKey: string;
    label: string;
  } | null>(null);
  const [exporting, setExporting] = useState(false);

  const downloadExcel = async () => {
    setExporting(true);
    try {
      const res = await api.get("/reports/monthly-debt-recovery/excel", {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `oylik-qarzdorlik-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(getErrorMessage(e, "Excel yuklab olishda xatolik"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Oylik qarzdorlik va undirish</h1>
          <p className="text-sm text-muted-foreground">
            Har oy qancha qarz bilan yopilgani (muzlagan tarix) va o&apos;sha
            qarzdan keyin qanchasi undirilgani. Batafsil ko&apos;rish uchun oyni
            bosing.
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={downloadExcel}
          disabled={exporting || months.length === 0}
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Excel yuklab olish
        </Button>
      </div>

      {/* Explainer note */}
      <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          &quot;Oy oxiridagi qarz&quot; — o&apos;sha oy oxirida balansi manfiy
          bo&apos;lgan barcha o&apos;quvchilar qarzi (statusdan qat&apos;i
          nazar). Bu raqam muzlagan — keyin o&apos;zgarmaydi.
          &quot;Undirildi&quot; va &quot;Qolgan qarz&quot; esa o&apos;quvchilar
          to&apos;lagani sari yangilanadi. Ledgerdan hisoblangan, kompaniya
          bo&apos;yicha.
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Oy</TableHead>
              <HeadWithHint
                className="text-right"
                label="Oy oxiridagi qarz"
                hint="O'sha oy oxirida (Toshkent) balansi manfiy bo'lgan barcha o'quvchilar qarzi. Muzlagan tarixiy raqam — keyin o'zgarmaydi."
              />
              <TableHead className="text-right">Qarzdorlar</TableHead>
              <HeadWithHint
                className="text-right"
                label="Undirildi"
                hint="O'sha oy qarzdorlarining keyingi naqd to'lovlari, har o'quvchida o'sha oy qarzi bilan cheklangan (tizim eng eski qarzdan yopadi)."
              />
              <HeadWithHint
                className="text-right"
                label="Kechirilgan"
                hint="Qarzni hisobdan chiqarish (DEBT_WRITE_OFF) — naqdsiz kechirilgan qarz. Undirishga qo'shilmaydi."
              />
              <HeadWithHint
                className="text-right"
                label="Qolgan qarz"
                hint="Oy oxiridagi qarz − Undirildi − Kechirilgan. Shu oy qarzidan hali qoplanmagan qismi."
              />
              <TableHead className="text-right">Undirish %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-9 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : months.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Hali ma&apos;lumot yo&apos;q.
                </TableCell>
              </TableRow>
            ) : (
              months.map((m, idx) => (
                <TableRow
                  key={m.monthKey}
                  className="cursor-pointer"
                  onClick={() =>
                    setTarget({ monthKey: m.monthKey, label: m.label })
                  }
                >
                  <TableCell className="border-r text-muted-foreground tabular-nums">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {m.label}
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
                            <TooltipContent className="max-w-56">
                              Mayda pul oqimi to&apos;liq to&apos;g&apos;ri
                              bo&apos;lmagan (eski tizimdan o&apos;tish) — raqam
                              taxminiy.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPrice(m.closingDebt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {m.debtorCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-green-700 dark:text-green-400">
                    {m.recovered > 0 ? (
                      formatPrice(m.recovered)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {m.writtenOff > 0 ? formatPrice(m.writtenOff) : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      m.remaining > 0 && "text-red-700 dark:text-red-400",
                    )}
                  >
                    {formatPrice(m.remaining)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatPercent(m.recoveryRate)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {!isLoading && months.length > 0 && totals && (
            <TableFooter>
              <TableRow>
                <TableCell className="border-r" />
                <TableCell className="font-semibold">Jami</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatPrice(totals.closingDebt)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right font-semibold tabular-nums text-green-700 dark:text-green-400">
                  {formatPrice(totals.recovered)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-muted-foreground">
                  {formatPrice(totals.writtenOff)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-red-700 dark:text-red-400">
                  {formatPrice(totals.remaining)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      <MonthDebtDetailDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
