import Link from "next/link";
import { ChevronRight, CircleAlert, CircleCheck } from "lucide-react";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { visibleAttentionRows } from "./dashboard-home-visibility";
import type { DashboardAttention } from "./dashboard-summary-types";

interface Props {
  attention: DashboardAttention;
  /** Outreach qatorlari (kelmaganlar, va'dalar, navbat) ko'rsatiladimi. */
  includeOutreach: boolean;
}

export function HomeAttentionList({ attention, includeOutreach }: Props) {
  const rows = visibleAttentionRows(attention, { includeOutreach });
  const debtors = attention.topDebtors;
  const isEmpty = rows.length === 0 && debtors.length === 0;

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <CircleAlert className="size-4 text-muted-foreground" />
        <h2 className="font-heading text-sm font-semibold">
          E&apos;tibor talab qiladi
        </h2>
      </header>

      {isEmpty ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
          Bugun e&apos;tibor talab qiladigan narsa yo&apos;q
        </div>
      ) : (
        <div className="divide-y">
          {rows.map((row) => (
            <Link
              key={row.key}
              href={row.href}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  row.tone === "danger" ? "bg-red-500" : "bg-orange-500",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.label}
              </span>
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  row.tone === "danger"
                    ? "text-red-600 dark:text-red-400"
                    : "text-orange-600 dark:text-orange-400",
                )}
              >
                {formatNumber(row.count)}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}

          {debtors.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Eng katta qarzdorlar
                </p>
                <Link
                  href="/payments/debt"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  Hammasi
                </Link>
              </div>
              {debtors.map((d) => (
                <Link
                  key={d.id}
                  href={`/students/profile/${d.id}`}
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent/40"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {d.name}
                  </span>
                  <span className="text-sm font-medium tabular-nums text-red-600 dark:text-red-400">
                    {formatBalance(d.balance)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
