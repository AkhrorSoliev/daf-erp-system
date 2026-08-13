"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { AlertTriangle, HandCoins, UserMinus, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { monthLabel, monthShort } from "../salary-utils";
import { DebtMonthsBadge } from "./debt-months-badge";
import { SummaryCard } from "../summary-card";

export interface TopUpRow {
  student: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string | null;
    balance: number;
    status: string;
  };
  lessons: number;
  /** What the CENTER paid the teacher for those lessons. */
  centerPaid: number;
  /** What to ask for: the student's debt today, same figure as their profile. */
  studentDebt: number;
  /** This month's fronted lessons at their frozen price. Not rendered. */
  studentOwed: number;
  /** Which months the DEBT is made of — not the months the center covered. */
  debtByMonth: { monthKey: string; amount: number }[];
  groups: { id: string; name: string }[];
  teachers: { id: number; name: string }[];
  firstLesson: string;
  lastLesson: string;
  /** Which months this student's fronted lessons fall in, oldest first. */
  months: { monthKey: string; lessons: number; centerPaid: number }[];
}

export interface TopUpResponse {
  month: string;
  data: TopUpRow[];
  totals: {
    centerPaid: number;
    studentDebt: number;
    studentOwed: number;
    lessonCount: number;
    studentCount: number;
    inactiveStudentCount: number;
    monthKeys: string[];
  };
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Faol",
  FROZEN: "Muzlatilgan",
  EXPELLED: "Chetlatilgan",
  GRADUATED: "Bitirgan",
  ARCHIVED: "Arxivlangan",
};

const PAGE_SIZES = [10, 20, 30, 40, 50];

/**
 * Is there anything left to collect from this student?
 *
 * The flag this list is built on (`isCenterTopUp`) cannot answer that. It is
 * cleared only when RETROACTIVE billing later settles a lesson that had gone
 * unbilled — but a debtor's lesson is normally billed straight away (the
 * balance simply goes negative), so when that student finally pays there is
 * nothing left for retroactive billing to settle and the flag is never cleared.
 * Production July 2026: all 622 fronted lessons already carried a
 * `LESSON_CONSUMPTION`, and 6 students back at a zero balance (#10210 paid
 * 490 000 on 05.08) were still on the list.
 *
 * The live balance is the ledger's own answer to "does this person still owe us
 * anything", so that is what decides.
 */
const hasDebt = (r: TopUpRow) => r.studentDebt > 0;

/**
 * Month chip text: "Iyul", not "Iyul 2026".
 *
 * Three chips carrying the same year read as three long labels the eye has to
 * strip before it can compare them. The year comes back only when a row
 * actually straddles two of them — "Dekabr, Yanvar" is genuinely ambiguous
 * without it. The full label stays in the chip's tooltip either way.
 */
function chipLabel(
  monthKey: string,
  months: TopUpRow["months"],
): string {
  const years = new Set(months.map((m) => m.monthKey.slice(0, 4)));
  return years.size > 1
    ? `${monthShort(monthKey)} ’${monthKey.slice(2, 4)}`
    : monthShort(monthKey);
}

interface Props {
  /**
   * The month to report on, or `"all"` for every month the center has fronted.
   * The picker, when there is one, lives in the parent.
   */
  month: string;
  /** Teacher-name filter, so this can foot to a filtered salary table. */
  search?: string;
  /** false while a Dialog holding this is closed — skips the request. */
  enabled?: boolean;
}

export const ALL_MONTHS = "all";

/**
 * "Markaz qo'shimchasi — kimdan undirish kerak": the students the center is
 * still owed by for a month's payroll top-up.
 *
 * Rendered in two places — inside the salary page's dialog (where the month
 * comes from the card that was clicked) and as a tab on the debt page (where a
 * picker chooses it). The month arrives as a prop rather than a `showPicker`
 * boolean, so neither caller has to opt out of the other's chrome.
 */
export function CenterTopUpContent({ month, search, enabled = true }: Props) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const allMonths = month === ALL_MONTHS;

  const { data, isLoading } = useQuery<TopUpResponse>({
    queryKey: ["salary-center-topup", month, search ?? ""],
    queryFn: async () => {
      const res = await api.get("/salary/monthly/center-topup", {
        params: {
          month: allMonths ? undefined : month || undefined,
          allMonths: allMonths ? "true" : undefined,
          search: search || undefined,
        },
      });
      return res.data;
    },
    enabled,
    staleTime: 0,
  });

  // A different month (or a new filter) is a different list — never leave the
  // reader on page 4 of a set that now has one page.
  useEffect(() => {
    setPage(1);
  }, [month, search, statusFilter]);

  const rows = useMemo(() => {
    // Students with nothing left to collect are never listed. They are not bad
    // data — the flag they carry is simply stale — but this list exists to
    // answer "who do I ring", and they are not an answer to it.
    let all = (data?.data ?? []).filter(hasDebt);
    if (statusFilter !== "all")
      all = all.filter((r) => r.student.status === statusFilter);
    return all;
  }, [data, statusFilter]);

  // EVERY figure on screen follows the filter — headline sums, footer and the
  // inactive warning alike. A header reporting the whole month next to a table
  // showing part of it reads as a contradiction rather than as context.
  const shown = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({
          centerPaid: t.centerPaid + r.centerPaid,
          studentDebt: t.studentDebt + r.studentDebt,
          lessons: t.lessons + r.lessons,
          students: t.students + 1,
          inactive: t.inactive + (r.student.status === "ACTIVE" ? 0 : 1),
        }),
        { centerPaid: 0, studentDebt: 0, lessons: 0, students: 0, inactive: 0 },
      ),
    [rows],
  );
  const isFiltered = statusFilter !== "all";

  // How much of the salary card's "Qolgan (markaz)" has, by the balance,
  // already come back. Computed over the WHOLE response, not the filtered rows
  // — it is a statement about that card, which this filter does not change.
  const alreadyBack = useMemo(
    () =>
      (data?.data ?? [])
        .filter((r) => !hasDebt(r))
        .reduce(
          (t, r) => ({ sum: t.sum + r.centerPaid, count: t.count + 1 }),
          { sum: 0, count: 0 },
        ),
    [data],
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {allMonths
          ? "Markaz qoplagan, hali qaytmagan dars yo'q — hammasi undirilgan."
          : `${monthLabel(month)}da markaz qoplagan, hali qaytmagan dars yo'q. Butun davrni ko'rish uchun oy tanlovini «Butun davr»ga qo'ying.`}
      </div>
    );
  }

  return (
    <>
      {/* Four cards, each answering one question a reader actually has:
          what did this cost us, what can we get back, from how many people,
          and how many of them are beyond automatic recovery. The hints carry
          the meaning — a finance number under a three-word label is read as
          whatever the reader already assumed. */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          tone="amber"
          icon={<HandCoins className="size-5 text-amber-700 dark:text-amber-300" />}
          label="Markaz to'lagan"
          value={`${formatPrice(shown.centerPaid)} so'm`}
          hint="Kassadan ustozlarga chiqqan pul"
        />
        <SummaryCard
          tone="red"
          icon={<Wallet className="size-5 text-red-700 dark:text-red-300" />}
          label="Olinishi kerak"
          value={`${formatPrice(shown.studentDebt)} so'm`}
          hint="Shu o'quvchilarning bugungi jami qarzi"
        />
        <SummaryCard
          tone="slate"
          icon={<Users className="size-5 text-slate-700 dark:text-slate-300" />}
          label="O'quvchilar"
          value={`${shown.students} ta`}
          hint={`${shown.lessons} ta dars qoplangan`}
        />
        <SummaryCard
          tone="violet"
          icon={
            <UserMinus className="size-5 text-violet-700 dark:text-violet-300" />
          }
          label="Faol emas"
          value={`${shown.inactive} ta`}
          hint="Darsga kelmaydi — pul o'zi qaytmaydi"
        />
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        {allMonths ? "Butun davr" : monthLabel(month)}
        {isFiltered && " · tanlangan holat"} · qarz oylarga bo&apos;linmaydi:
        telefonda o&apos;quvchining to&apos;liq qarzi so&apos;raladi, u qaysi
        oylardan yig&apos;ilgani &laquo;⧉&raquo; nishonida ko&apos;rinadi.
        {alreadyBack.count > 0 && (
          <>
            {" "}
            Oylik kartasida {formatPrice(data.totals.centerPaid)} turibdi —
            farqi puli qaytgan {alreadyBack.count} o&apos;quvchi.
          </>
        )}
      </p>

      {shown.inactive > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {shown.inactive} ta o&apos;quvchi faol emas (muzlatilgan /
            chetlatilgan / arxiv). Ular darsga kelmaydi, ya&apos;ni bu pul
            o&apos;z-o&apos;zidan qaytmaydi — ular bilan bog&apos;lanish kerak.
          </span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha holatlar</SelectItem>
            <SelectItem value="ACTIVE">Faol</SelectItem>
            <SelectItem value="FROZEN">Muzlatilgan</SelectItem>
            <SelectItem value="EXPELLED">Chetlatilgan</SelectItem>
            <SelectItem value="GRADUATED">Bitirgan</SelectItem>
            <SelectItem value="ARCHIVED">Arxivlangan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>O&apos;quvchi</TableHead>
              <TableHead>Guruh</TableHead>
              {/* NOT "which months is the debt from" — that is a different set
                  and a bigger one. Production August 2026: the center fronted
                  only July, while these students' debt runs from May
                  (#10050 owes 633 323 dating to 2026-05). Naming this column
                  after the debt would have it answer a question it cannot. */}
              <TableHead>Markaz qoplagan oylar</TableHead>
              <TableHead className="text-right">Darslar</TableHead>
              {/* Two columns, two questions — nothing else. The month's lesson
                  price used to sit between them and was neither: not what the
                  center spent, not what anyone owes now. */}
              <TableHead className="text-right">
                Markaz ustozga to&apos;lagan
              </TableHead>
              <TableHead className="text-right">
                O&apos;quvchining qarzi
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Bu holatda o&apos;quvchi yo&apos;q — filtrni o&apos;zgartirib
                  ko&apos;ring.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r, i) => (
                <TableRow key={r.student.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {(page - 1) * pageSize + i + 1}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/students/profile/${r.student.id}`}
                      className="font-medium hover:underline"
                    >
                      {r.student.firstName} {r.student.lastName}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>
                        #{r.student.id}
                        {r.student.phone ? ` · +998 ${r.student.phone}` : ""}
                      </span>
                      {r.student.status !== "ACTIVE" && (
                        <Badge
                          variant="outline"
                          className="px-1 py-0 text-[10px] font-normal"
                        >
                          {STATUS_LABELS[r.student.status] ?? r.student.status}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  {/* The first/last lesson dates used to sit under the group
                      name. The months column says the same thing in less room,
                      so the exact dates moved into its tooltip. */}
                  <TableCell className="text-sm">
                    {r.groups.map((g) => g.name).join(", ")}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.months.map((m) => (
                        <Badge
                          key={m.monthKey}
                          variant="secondary"
                          className="px-1.5 py-0 text-[11px] font-normal"
                          title={`${monthLabel(m.monthKey)}: ${m.lessons} dars · markaz ${formatPrice(m.centerPaid)} so'm`}
                        >
                          {chipLabel(m.monthKey, r.months)}
                          <span className="ml-1 opacity-60">{m.lessons}</span>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.lessons}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-amber-700 dark:text-amber-400">
                    {formatPrice(r.centerPaid)}
                  </TableCell>
                  {/* Always > 0 — a zero-debt row never reaches here. The badge
                      appears only when the debt spans more than one month, so
                      the single figure is never read as one month's arrears. */}
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <DebtMonthsBadge
                        studentName={`${r.student.firstName} ${r.student.lastName}`.trim()}
                        months={r.debtByMonth}
                        totalDebt={r.studentDebt}
                      />
                      <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">
                        {formatPrice(r.studentDebt)}
                      </span>
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell className="border-r" />
                <TableCell className="font-semibold">Jami</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right font-semibold tabular-nums">
                  {shown.lessons}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {formatPrice(shown.centerPaid)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-red-600 dark:text-red-400">
                  {formatPrice(shown.studentDebt)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Sahifada:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">Jami {rows.length} ta</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "rounded-md border px-3 py-1 disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Oldingi
            </button>
            <span className="text-muted-foreground">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className={cn(
                "rounded-md border px-3 py-1 disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Keyingi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
