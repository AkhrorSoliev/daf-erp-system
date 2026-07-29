"use client";

import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/components/payments/salary-utils";
import type { MonthlyUserRow } from "@/components/shared/salary-monthly-panel";

interface MonthlyUserResponse {
  month: string;
  row: MonthlyUserRow | null;
}

/**
 * "To'lanishi kerak" for the CURRENT month on a profile card.
 *
 * Replaces the old "Balans" figure, which read `User.balance` — a running
 * ledger that only ever grew (it rises on every accrual and drops only when a
 * salary is marked PAID) and never subtracted the advances already handed to
 * the teacher. It is now the same net figure `/payments/salary` shows.
 *
 * Money — render only for CEO / Branch Director.
 */
export function SalaryDueCard({
  userId,
  scope = "admin",
  className,
}: {
  userId: number;
  /** `"me"` reads the caller's own row; `"admin"` is CEO/BD viewing someone. */
  scope?: "admin" | "me";
  className?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["salary-due", scope, userId],
    queryFn: () =>
      api
        .get<MonthlyUserResponse>(
          scope === "me" ? "/salary/me/monthly" : `/salary/monthly/user/${userId}`,
        )
        .then((r) => r.data),
    staleTime: 0,
  });

  const row = data?.row ?? null;
  // Teacher rows carry the per-lesson split; staff rows carry a flat monthly.
  const gross = row?.fullDeserved ?? row?.monthly ?? null;

  return (
    <div className={cn("text-center", className)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            To&apos;lanishi kerak
            {data?.month ? ` · ${monthLabel(data.month)}` : ""}
            <Info className="size-3" />
          </TooltipTrigger>
          <TooltipContent className="max-w-56">
            Shu oy uchun to&apos;lanishi kerak bo&apos;lgan sof summa — avans
            allaqachon ayirilgan. «Ish haqi» bo&apos;limidagi va Moliya →
            Ustozlar oyligi sahifasidagi raqam bilan bir xil.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isLoading ? (
        <Skeleton className="mx-auto mt-1 h-6 w-32" />
      ) : row == null ? (
        <p className="text-lg font-bold text-muted-foreground">—</p>
      ) : (
        <>
          <p className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">
            {formatPrice(row.netToPay)} so&apos;m
          </p>
          {gross != null && (
            <p className="text-xs text-muted-foreground tabular-nums">
              Ishlangan {formatPrice(gross)}
              {row.advances > 0 ? ` · avans −${formatPrice(row.advances)}` : ""}
            </p>
          )}
        </>
      )}
    </div>
  );
}
