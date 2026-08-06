"use client";

import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUrlFilters } from "@/hooks/use-url-filters";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import {
  SALARY_STATUS_BADGE,
  SALARY_STATUS_LABELS,
  currentMonthKey,
  monthLabel,
} from "@/components/payments/salary-utils";

/**
 * One person's row from the monthly salary report.
 *
 * Teacher rows carry the per-lesson split (`fullDeserved` / `covered` /
 * `centerFunded`); non-teaching fixed-salary staff carry a flat `monthly`. Both carry
 * `advances` and `netToPay`.
 */
export interface MonthlyUserRow {
  user: { id: number; firstName: string; lastName: string };
  hasLessonData?: boolean;
  isFixedMonthly?: boolean;
  fullDeserved?: number | null;
  covered?: number | null;
  centerFunded?: number | null;
  /** Non-teaching FIXED_MONTHLY staff only. */
  monthly?: number;
  advances: number;
  netToPay: number;
  payment: { id: string; amount: number; status: string } | null;
}

interface MonthlyUserResponse {
  month: string;
  floorMonth: string;
  period: { periodStart: string; periodEnd: string; cycleStartDay: number };
  row: MonthlyUserRow | null;
}

const FALLBACK_FLOOR = "2026-05";

/**
 * Own URL param so it never collides with the page-level `?tab=`.
 * Empty default → the current month, and the param stays out of the URL.
 */
const filtersSchema = {
  salary_month: { type: "string" as const, defaultValue: "" },
};

interface Props {
  /** Whose salary to show. */
  userId: number;
  /**
   * `"admin"` reads the CEO/BD per-user route; `"me"` reads the caller's own
   * row (lehrer portal). Both hit the same server-side computation.
   */
  scope: "admin" | "me";
}

function MoneyCard({
  label,
  value,
  tooltip,
  className,
  valueClassName,
}: {
  label: string;
  value: number | null | undefined;
  tooltip?: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("space-y-1 rounded-lg border p-3", className)}>
      {tooltip ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {label}
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-56">{tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <p className="text-xs text-muted-foreground">{label}</p>
      )}
      <p className={cn("text-lg font-bold tabular-nums", valueClassName)}>
        {value == null ? (
          <span className="font-normal text-muted-foreground">—</span>
        ) : (
          `${formatPrice(value)} so'm`
        )}
      </p>
    </div>
  );
}

/**
 * The teacher's salary for ONE selected month, read straight from the report
 * that powers `/payments/salary`. Rendering the same server-computed row is
 * what keeps the profile and the salary page from disagreeing — there is
 * deliberately no calculation in this component.
 */
export function SalaryMonthlyPanel({ userId, scope }: Props) {
  const { filters, setFilters } = useUrlFilters(filtersSchema);
  const maxMonth = currentMonthKey();
  const month = filters.salary_month || maxMonth;

  const { data, isLoading } = useQuery({
    queryKey: ["salary-monthly-user", scope, userId, month],
    queryFn: () =>
      api
        .get<MonthlyUserResponse>(
          scope === "me" ? "/salary/me/monthly" : `/salary/monthly/user/${userId}`,
          { params: { month } },
        )
        .then((r) => r.data),
    staleTime: 0,
  });

  const row = data?.row ?? null;
  const shownMonth = data?.month ?? month;
  const floorMonth = data?.floorMonth ?? FALLBACK_FLOOR;
  // Staff rows have no per-lesson split; teacher rows in a manual month
  // (May — configs only became effective in June) report it as unavailable.
  const isStaffRow = row != null && row.monthly !== undefined;
  const noLessonData = row != null && !isStaffRow && !row.hasLessonData;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker
          value={shownMonth}
          minMonth={floorMonth}
          maxMonth={maxMonth}
          onChange={(m) => setFilters({ salary_month: m })}
          className="w-52"
        />
        {row?.payment && (
          <Badge
            variant="secondary"
            className={SALARY_STATUS_BADGE[row.payment.status] ?? ""}
          >
            {SALARY_STATUS_LABELS[row.payment.status] ?? row.payment.status}
          </Badge>
        )}
      </div>

      {noLessonData && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            {monthLabel(shownMonth)} — bu oy qo&apos;lda kiritilgan, dars-by-dars
            ma&apos;lumot yo&apos;q. Faqat kiritilgan summa va avans ko&apos;rsatilgan.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
      ) : !row ? (
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">
            {monthLabel(shownMonth)} uchun oylik ma&apos;lumoti yo&apos;q — boshqa
            oyni tanlab ko&apos;ring.
          </p>
        </div>
      ) : (
        <>
          {/* The headline: what the center actually owes for this month. */}
          <MoneyCard
            label="To'lanishi kerak"
            value={row.netToPay}
            tooltip="Bu oy uchun to'lanishi kerak bo'lgan sof summa: to'liq ishlangan (markaz qo'shimchasi bilan) − avans. Hisoblab bo'lingan oylar uchun haqiqiy to'langan summa ko'rsatiladi."
            className="border-primary/30 bg-primary/5 p-4"
            valueClassName="text-2xl"
          />

          {isStaffRow ? (
            <div className="grid grid-cols-2 gap-3">
              <MoneyCard label="Oylik (belgilangan)" value={row.monthly} />
              <MoneyCard label="Avans" value={row.advances} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MoneyCard label="To'liq ishlangan" value={row.fullDeserved} />
              <MoneyCard
                label="O'quvchilar to'lagan"
                value={row.covered}
                tooltip="To'liq ishlangandan o'quvchilar haqiqatan to'lagani bilan qoplangan qismi."
              />
              <MoneyCard
                label="Markaz qo'shimchasi"
                value={row.centerFunded}
                tooltip="Markazning o'z hisobidan qo'shgan (yoki oy yopilgunicha qo'shadigan) qismi. Oy yopilgach bu raqam qolaveradi — o'quvchi keyin to'lasa, pul markazga qaytadi, ustozga qayta yozilmaydi."
                valueClassName={
                  (row.centerFunded ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : ""
                }
              />
              <MoneyCard
                label="Avans"
                value={row.advances}
                tooltip="Shu oy ichida ustozga oldindan berilgan pul (Xarajatlar → Avans). U «To'lanishi kerak»dan allaqachon ayirilgan."
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
