"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { DebtMonthsBadge } from "@/components/payments/debt/debt-months-badge";

interface DebtOrigin {
  since: string;
  months: Record<string, number>;
}

/** Whole months between two dates, floored at 0 — mirrors the server helper. */
function monthsSince(since: Date, now: Date): number {
  let months =
    (now.getFullYear() - since.getFullYear()) * 12 +
    (now.getMonth() - since.getMonth());
  if (now.getDate() < since.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * How old this student's debt is, and which months it is made of, beside the
 * balance badge on their profile.
 *
 * Reads the same replay the debtors list and the center top-up tab read, so a
 * student is not described one way on a list and another on their own page.
 * Fetched separately from the profile rather than folded into it: the answer
 * needs a ledger walk, and a profile must not wait on one to render a name.
 */
export function StudentDebtOrigin({
  studentId,
  studentName,
}: {
  studentId: number;
  studentName: string;
}) {
  const { data } = useQuery<DebtOrigin | null>({
    queryKey: ["student-debt-origin", studentId],
    queryFn: () =>
      api
        .get<DebtOrigin | null>(`/students/${studentId}/debt-origin`)
        .then((r) => r.data),
    staleTime: 0,
  });

  if (!data) return null;

  const since = new Date(data.since);
  const months = monthsSince(since, new Date());
  const slices = Object.entries(data.months).map(([monthKey, amount]) => ({
    monthKey,
    amount,
  }));
  const total = slices.reduce((s, x) => s + x.amount, 0);
  const label =
    months === 0 ? "shu oydan" : months === 1 ? "1 oy" : `${months} oy`;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={
                months >= 3
                  ? "cursor-help border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
                  : "cursor-help"
              }
            >
              <CalendarClock className="mr-1 size-3" />
              {label} qarzdor
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {format(since, "dd.MM.yyyy")} dan beri
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DebtMonthsBadge
        studentName={studentName}
        months={slices}
        totalDebt={total}
      />
    </div>
  );
}
