"use client";

import { Fragment, type ReactNode } from "react";
import { useT } from "@/i18n/context";
import { formatBalance, formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { dayMonth } from "../overview/overview-math";
import { PossibleDeductionsInfo } from "../possible-deductions-info";
import {
  advanceAheadNote,
  calcLines,
  drawerTotalLabel,
  payoutLines,
  rateText,
  splitLine,
  type CalcLine,
} from "./salary-drawer-model";
import type { AdvanceItem, MonthStateKind, RateRef, SalaryDetail, TeacherRow } from "./salary-types";

// The row drawer's body, top to bottom as spec §2.5 lists it.

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Line({ left, sub, right }: { left: ReactNode; sub?: ReactNode; right: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <div className="min-w-0">
        <div className="truncate">{left}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div className="shrink-0 tabular-nums">{right}</div>
    </div>
  );
}

const sameRate = (a: RateRef | null | undefined, b: RateRef | null | undefined) =>
  !!a && !!b && a.salaryType === b.salaryType && a.value === b.value;

function GroupsBlock({ row, month }: { row: TeacherRow; month: string }) {
  const t = useT();
  const groups = row.groups ?? [];
  const split = splitLine(row, t);
  if (groups.length === 0 && row.carriedIn <= 0 && !split) return null;
  return (
    <Block title={t("Guruhlar bo'yicha")}>
      {groups.map((g) => (
        <Line
          key={g.groupId}
          left={g.name}
          sub={
            <>
              {t("{students} o'quvchi · {lessons} dars", { students: g.students, lessons: g.lessons })}
              {/* The group's own rate, only where it is not the general one. */}
              {g.rate && !sameRate(g.rate, row.rate) && <> · {rateText(g.rate, "teacher", undefined, month, t)}</>}
            </>
          }
          right={formatPrice(g.amount)}
        />
      ))}
      {row.carriedIn > 0 && <Line left={t("Oldingi oydan")} right={formatPrice(row.carriedIn)} />}
      {split && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{split}</p>}
    </Block>
  );
}

function AdvancesBlock({ items }: { items: AdvanceItem[] }) {
  const t = useT();
  return (
    <Block title={t("Avanslar — shu oylikdan ushlanadi")}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Avans olinmagan")}</p>
      ) : (
        items.map((a) => (
          <Line
            key={a.id}
            // `date` is a calendar day (`@db.Date`): read it off the string.
            left={`${dayMonth(a.date.slice(0, 10))} · ${a.paymentMethod === "CASH" ? t("naqd") : t("karta")}`}
            right={formatPrice(a.amount)}
          />
        ))
      )}
    </Block>
  );
}

function signed({ value, sign }: CalcLine): string {
  if (sign === "-") return `− ${formatPrice(value)}`;
  if (sign === "±") return value > 0 ? `+${formatPrice(value)}` : `−${formatPrice(-value)}`;
  return formatPrice(value);
}

function CalcBlock({ detail }: { detail: SalaryDetail }) {
  const t = useT();
  const note = advanceAheadNote(detail, t);
  return (
    <Block title={t("Hisob")}>
      {calcLines(detail, t).map((l) => (
        <Fragment key={l.label}>
          <div
            className={cn(
              "flex items-baseline justify-between gap-3 text-sm",
              l.sign === "=" && "border-t pt-2 font-semibold",
            )}
          >
            <span>{l.label}</span>
            <span className="tabular-nums">{signed(l)}</span>
          </div>
          {l.sign === "-" && note && <p className="text-xs text-muted-foreground">{note}</p>}
        </Fragment>
      ))}
    </Block>
  );
}

function PayoutBlock({ payout }: { payout: NonNullable<SalaryDetail["payout"]> }) {
  const t = useT();
  const p = payoutLines(payout, t);
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-green-500/15 px-4 py-3 text-sm">
      <div className="font-semibold">{p.title}</div>
      {p.slices.map((s, i) => (
        // Two slices can read the same (one account, one amount): the index keys them.
        <div key={i} className="tabular-nums">
          {s}
        </div>
      ))}
      {p.by && <div className="text-muted-foreground">{p.by}</div>}
    </div>
  );
}

export function SalaryDrawerBody({ detail, state }: { detail: SalaryDetail; state: MonthStateKind }) {
  const t = useT();
  const { row } = detail;
  const teacherRow = "fullDeserved" in row ? row : null;
  const coverage = "fullDeserved" in row ? undefined : row.coverage;
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border bg-card px-4 py-3">
        <div className="text-xs text-muted-foreground">{drawerTotalLabel(state, row.payment, t)}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{formatBalance(row.netToPay, t("so'm"))}</div>
      </div>
      <Block title={t("Stavka")}>
        <p className="text-sm">{rateText(row.rate, detail.kind, coverage, detail.month, t)}</p>
      </Block>
      {teacherRow && <GroupsBlock row={teacherRow} month={detail.month} />}
      <AdvancesBlock items={row.advanceItems ?? []} />
      <CalcBlock detail={detail} />
      {detail.payout && <PayoutBlock payout={detail.payout} />}
      {/* The company-wide deductions note the old breakdown drawer carried. */}
      <PossibleDeductionsInfo />
    </div>
  );
}
