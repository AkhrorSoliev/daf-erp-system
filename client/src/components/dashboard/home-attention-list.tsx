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
    <section className="rounded-lg border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <CircleAlert className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">E&apos;tibor talab qiladi</h2>
      </header>

      {isEmpty ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-success" />
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
              {/* The count leads the row as a tinted figure: what is wrong,
                  how much of it, then where to go. */}
              <span
                className={cn(
                  "min-w-10 rounded-md px-1.5 py-0.5 text-center text-sm font-semibold",
                  row.tone === "danger"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-warning/15 text-warning",
                )}
              >
                {formatNumber(row.count)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.label}
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
                  <span className="text-sm font-medium text-destructive">
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
