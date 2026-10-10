"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/format-utils";
import { useSalaryMonthly } from "./salary-queries";

/**
 * «Markaz qo'shimchasi — undirish holati» for one month: the company-level
 * center top-up lifecycle. Moved here from the «Oyliklar» tab (spec §2.4) with
 * the same data; it reads the page's monthly answer from the shared cache and
 * is drawn only for a month in which the center actually fronted money.
 *
 * Its figures are plain text: the card sits above the list it used to link to,
 * on the same tab and month, so a link would lead back to this page.
 */
export function SalaryCenterRecoveryCard({ month }: { month: string }) {
  const { data } = useSalaryMonthly(month, "");
  const totals = data?.totals;
  if (!totals || totals.centerAdvanced <= 0) return null;

  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-sm font-medium">
        Markaz qo&apos;shimchasi — undirish holati (bu oy)
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="size-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              Markaz o&apos;quvchilar to&apos;lamagan qismni ustozlarga
              qo&apos;shib bergan. O&apos;quvchilar keyin to&apos;lasa, u pul
              markazga qaytadi (undirildi) va ustozga qayta yozilmaydi.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">
            Jami qo&apos;shdi
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {formatPrice(totals.centerAdvanced)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Undirildi</div>
          <div className="text-lg font-semibold tabular-nums text-green-700 dark:text-green-400">
            {formatPrice(totals.centerRecovered)}
          </div>
        </div>
        {/* What can actually be collected from the people the center
            fronted for — their debt TODAY. Deliberately NOT part of the
            X = Y + Z arithmetic of the other three cells: it is a live
            balance, not a share of this month's payroll. */}
        <div>
          <div className="text-xs text-muted-foreground">
            O&apos;quvchilardan olinishi kerak
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {formatPrice(totals.centerOwedByStudents)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Shu o&apos;quvchilarning qarzi
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">
            Qolgan (markaz)
          </div>
          {/* X and Y are history; Z is money still to be collected — the list below. */}
          <div className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {formatPrice(totals.centerStillFronted)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Ustoz ulushi
          </div>
        </div>
      </div>
    </div>
  );
}
