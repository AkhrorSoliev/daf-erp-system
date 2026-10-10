"use client";

import Link from "next/link";
import { ArrowUpRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { useSalaryMonthly } from "./salary-queries";

/**
 * A card figure that links to where it is explained.
 *
 * A bare number carries no hint that it does anything, and the card holds four
 * of them — two inert, two not. The dotted underline says "link" and the arrow
 * says "this goes somewhere", so the two live figures read as different in kind
 * from "Jami qo'shdi" / "Undirildi" rather than merely differently coloured.
 *
 * It is a `<Link>`, not a button opening a dialog. The same list already lives
 * in this page's «Markaz qoplagani» tab, and a dialog holding a second copy meant two places to
 * keep in step — plus a list nobody could open in a new tab or send to a
 * colleague. Falls back to plain text at zero: an affordance leading to an
 * empty list is worse than none.
 */
function DrillDownAmount({
  value,
  href,
  label,
  className,
}: {
  value: number;
  /** Where the figure is explained. A real link, so Cmd-click opens a tab. */
  href: string;
  /** Read out by screen readers and shown on hover — the number alone is mute. */
  label: string;
  className?: string;
}) {
  if (value <= 0)
    return (
      <div className={cn("text-lg font-semibold tabular-nums", className)}>
        {formatPrice(value)}
      </div>
    );
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-sm text-lg font-semibold tabular-nums",
        "underline decoration-dotted underline-offset-4 transition hover:decoration-solid",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {formatPrice(value)}
      <ArrowUpRight className="size-4 shrink-0 opacity-50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
    </Link>
  );
}

/**
 * «Markaz qo'shimchasi — undirish holati» for one month: the company-level
 * center top-up lifecycle. Moved here from the «Oyliklar» tab (spec §2.4) with
 * the same data; it reads the page's monthly answer from the shared cache and
 * is drawn only for a month in which the center actually fronted money.
 */
export function SalaryCenterRecoveryCard({ month }: { month: string }) {
  const { data } = useSalaryMonthly(month, "");
  const totals = data?.totals;
  const shownMonth = data?.month ?? month;
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
          <DrillDownAmount
            value={totals.centerOwedByStudents}
            href={`/payments/salary?tab=markaz&month=${shownMonth}`}
            label="O'quvchilardan olinishi kerak bo'lgan summa — kimdan undirish kerakligini ko'rish"
          />
          <div className="mt-0.5 text-xs text-muted-foreground">
            Shu o&apos;quvchilarning qarzi
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">
            Qolgan (markaz)
          </div>
          {/* The only actionable figure of the three: X and Y are history,
              Z is money still to be collected. Clicking it opens the list
              of students it is owed by. */}
          <DrillDownAmount
            value={totals.centerStillFronted}
            href={`/payments/salary?tab=markaz&month=${shownMonth}`}
            label="Markaz qoplagan, hali qaytmagan summa — kimdan undirish kerakligini ko'rish"
            className="text-amber-700 dark:text-amber-400"
          />
          {/* Symmetric with the cell to its left: each says what its number
              is priced on, and the underline + icon carry the "clickable". */}
          <div className="mt-0.5 text-xs text-muted-foreground">
            Ustoz ulushi
          </div>
        </div>
      </div>
    </div>
  );
}
