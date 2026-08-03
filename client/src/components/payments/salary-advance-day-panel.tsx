"use client";

import { HandCoins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBalance, formatPrice } from "@/lib/format-utils";
import { EXPENSE_METHOD_LABELS } from "./expenses-filter-bar";
import { employeeRoleLabel } from "./employee-advance-select";
import type { AdvanceRow } from "./salary-advances-tab";

/** "2026-07-15" → "15.07.2026". */
function longDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Tanlangan kunning avanslari. Ataylab `<Table>` emas, ro'yxat: panel tor va
 * bir kunga odatda 1–5 qator to'g'ri keladi, `<Table>` bo'lsa loyiha qoidasi
 * `#` ustuni va 10 qatorli sahifalashni majburiy qilardi.
 */
export function SalaryAdvanceDayPanel({
  date,
  advances,
  canPay,
  onAdd,
}: {
  date: string | null;
  advances: AdvanceRow[];
  canPay: boolean;
  onAdd: (date: string) => void;
}) {
  if (date === null) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed p-6">
        <p className="text-center text-sm text-muted-foreground">
          Tafsilotni ko&apos;rish uchun kalendardan kun tanlang.
        </p>
      </div>
    );
  }

  const rows = advances.filter((a) => a.date === date);
  const total = rows.reduce((s, a) => s + a.amount, 0);

  return (
    <div className="flex flex-col rounded-lg border">
      <div className="border-b px-4 py-3">
        <p className="font-medium">{longDay(date)}</p>
        <p className="text-sm text-muted-foreground">
          Jami {formatBalance(total)} · {rows.length} ta
        </p>
      </div>

      <div className="flex-1 divide-y">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Bu kunda avans berilmagan.
          </p>
        ) : (
          rows.map((a) => (
            <div key={a.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {a.user.firstName} {a.user.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {employeeRoleLabel(a.user.roles)}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatPrice(a.amount)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-normal">
                  {EXPENSE_METHOD_LABELS[a.paymentMethod] ?? a.paymentMethod}
                </Badge>
                {a.description && a.description !== "Avans" && (
                  <span className="text-xs text-muted-foreground">
                    {a.description}
                  </span>
                )}
                {a.createdBy && (
                  <span className="text-xs text-muted-foreground">
                    · {a.createdBy.firstName} {a.createdBy.lastName} bergan
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {canPay && (
        <div className="border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onAdd(date)}
          >
            <HandCoins className="size-4" />
            Bu kunga avans qo&apos;shish
          </Button>
        </div>
      )}
    </div>
  );
}
