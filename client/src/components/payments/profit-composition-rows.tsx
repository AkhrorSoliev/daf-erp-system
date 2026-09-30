"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatPrice } from "@/lib/format-utils";
import {
  expenseLabel,
  expenseSummary,
  withdrawalSub,
  type NamedRows,
  type ProfitComposition,
} from "./profit-composition-text";

/**
 * The lines the Foyda figure is made of (the withdrawal line only in a month
 * that has one). Each opens to show what is in it; a line with nothing to
 * show stays a plain row.
 */
export function ProfitCompositionRows({ data }: { data: ProfitComposition }) {
  const { revenue, withdrawals, teachers, staff, expenses } = data;
  return (
    <div className="rounded-lg border bg-card px-3">
      <BreakdownRow
        dot="bg-green-500"
        label="O'tilgan darslar puli"
        sub={`${revenue.studentCount} o'quvchi o'qigan darslar puli`}
        amount={revenue.total}
      >
        {revenue.byBranch.length > 1 && (
          <div className="mb-1.5 space-y-0.5 border-b pb-1.5">
            {revenue.byBranch.map((b) => (
              <DetailLine key={b.id} name={b.name} amount={b.amount} />
            ))}
          </div>
        )}
        <NamedDetail rows={revenue.byCourse} restLabel="Boshqa kurslar" />
      </BreakdownRow>

      {withdrawals.total !== 0 && (
        <BreakdownRow
          dot="bg-green-300"
          label="Balansdan yechib olingan"
          sub={withdrawalSub(withdrawals)}
          amount={withdrawals.total}
        >
          {withdrawals.rows.length > 0 ? (
            <NamedDetail
              rows={withdrawals}
              restLabel="Yana"
              restUnit="o'quvchi"
            />
          ) : undefined}
        </BreakdownRow>
      )}

      <BreakdownRow
        dot="bg-slate-500"
        label="Ustozlar haqi"
        sub={
          teachers.advances > 0
            ? `${teachers.count} ustoz · berilgan ${formatPrice(teachers.advances)} so'm avans shuning ichida`
            : `${teachers.count} ustoz`
        }
        amount={-teachers.total}
      >
        {teachers.rows.length > 0 ? (
          <NamedDetail rows={teachers} restLabel="Yana" restUnit="ustoz" />
        ) : undefined}
      </BreakdownRow>

      <BreakdownRow
        dot="bg-slate-400"
        label="Xodimlar oyligi"
        sub={
          staff.count > 0
            ? `${staff.count} kishi`
            : staff.total > 0
              ? "To'langan oyliklar"
              : "Bu oy yozilmagan"
        }
        amount={-staff.total}
      >
        {staff.rows.length > 0 ? <NamedDetail rows={staff} /> : undefined}
      </BreakdownRow>

      <BreakdownRow
        dot="bg-slate-300"
        label="Boshqa xarajatlar"
        sub={
          expenses.categories.length
            ? expenseSummary(expenses.categories)
            : "Yozilmagan"
        }
        amount={-expenses.total}
      >
        {expenses.categories.length > 0 ? (
          <div className="space-y-1.5">
            {expenses.categories.map((c) => (
              <div key={c.category}>
                <DetailLine
                  name={expenseLabel(c.category)}
                  amount={c.amount}
                  strong
                />
                {c.items.map((it, i) => (
                  <DetailLine
                    key={i}
                    name={it.description || "—"}
                    amount={it.amount}
                    muted
                    indent
                  />
                ))}
              </div>
            ))}
          </div>
        ) : undefined}
      </BreakdownRow>

      <BreakdownRow
        dot="bg-red-300"
        label="Qaytarilgan pul"
        amount={-data.refunds}
      />

      <div className="flex items-center justify-between gap-3 border-t py-2.5">
        <span className="text-sm font-semibold">Sof foyda</span>
        <span
          className={`text-sm font-bold tabular-nums ${data.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
        >
          {formatPrice(data.netProfit)}
        </span>
      </div>
    </div>
  );
}

function BreakdownRow({
  dot,
  label,
  sub,
  amount,
  children,
}: {
  dot: string;
  label: string;
  sub?: string;
  /** Signed: a cost is passed negative and shown with a minus. */
  amount: number;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const expandable = children != null && children !== false;
  const figure =
    amount > 0
      ? `+${formatPrice(amount)}`
      : amount < 0
        ? `−${formatPrice(-amount)}`
        : "0";

  const head = (
    <>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className={`size-2.5 shrink-0 rounded-full ${dot}`} />
          {label}
          {expandable && (
            <ChevronDown
              className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          )}
        </span>
        {sub && (
          <span className="block pl-4 text-xs text-muted-foreground">
            {sub}
          </span>
        )}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {figure}
      </span>
    </>
  );

  if (!expandable) {
    return (
      <div className="flex items-start justify-between gap-3 border-t py-2.5 first:border-t-0">
        {head}
      </div>
    );
  }
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-t first:border-t-0"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-start justify-between gap-3 py-2.5 text-left"
        >
          {head}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-2.5 pl-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function NamedDetail({
  rows,
  restLabel = "Boshqalar",
  restUnit,
}: {
  rows: NamedRows;
  restLabel?: string;
  restUnit?: string;
}) {
  return (
    <div className="space-y-0.5">
      {rows.rows.map((r, i) => (
        <DetailLine
          key={i}
          name={r.detail ? `${r.name} · ${r.detail}` : r.name}
          amount={r.amount}
        />
      ))}
      {rows.rest.count > 0 && (
        <DetailLine
          name={
            restUnit
              ? `${restLabel} ${rows.rest.count} ${restUnit}`
              : `${restLabel} (${rows.rest.count})`
          }
          amount={rows.rest.amount}
          muted
        />
      )}
    </div>
  );
}

function DetailLine({
  name,
  amount,
  muted,
  strong,
  indent,
}: {
  name: string;
  amount: number;
  muted?: boolean;
  strong?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 text-xs ${muted ? "text-muted-foreground" : ""} ${indent ? "pl-3" : ""}`}
    >
      <span className={`min-w-0 truncate ${strong ? "font-medium" : ""}`}>
        {name}
      </span>
      <span className={`shrink-0 tabular-nums ${strong ? "font-medium" : ""}`}>
        {formatPrice(amount)}
      </span>
    </div>
  );
}
