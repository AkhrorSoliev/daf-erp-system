"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import {
  AlertTriangle,
  HandCoins,
  Info,
  Search,
  UserMinus,
  Users,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { DebtMonthsBadge } from "./debt-months-badge";
import { monthLabel, monthShort } from "../salary-utils";
import { SummaryCard } from "../summary-card";
import {
  MultiSelectCombobox,
  type MultiSelectOption,
} from "@/components/ui/multi-select-combobox";

const STUDENT_STATUS_OPTIONS: MultiSelectOption[] = [
  { value: "ACTIVE", label: "Faol" },
  { value: "FROZEN", label: "Muzlatilgan" },
  { value: "EXPELLED", label: "Chetlatilgan" },
  { value: "GRADUATED", label: "Bitirgan" },
  { value: "ARCHIVED", label: "Arxivlangan" },
];

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
  /** What the CENTER paid the teacher for those lessons. Company total only. */
  centerPaid: number;
  /**
   * Of that spend, how much has NOT come back — capped by what the student
   * still owes for those lessons. THE figure this list is worked from.
   */
  centerUnrecovered: number;
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
  /**
   * true when the month is not settled yet: these lessons are ALREADY HELD but
   * payroll has not run, so the center has not paid for them — it will. Kept as
   * a separate state and never merged into the paid figures, because money out
   * of the till and money about to leave it are not the same number.
   */
  isForecast: boolean;
  data: TopUpRow[];
  totals: {
    centerPaid: number;
    centerUnrecovered: number;
    /** Counted in `centerPaid`, but repaid in full so they carry no row. */
    repaidStudentCount: number;
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
const hasDebt = (r: TopUpRow) => r.centerUnrecovered > 0;

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
}

export const ALL_MONTHS = "all";

/**
 * "Markaz qo'shimchasi — kimdan undirish kerak": the students the center is
 * still owed by for a month's payroll top-up.
 *
 * One home, on /payments/debt. The salary page used to render a second copy in
 * a dialog; its card now links here instead, because two places showing one
 * list meant two to keep in step and a list that could not be opened in a tab
 * or sent to someone. The month arrives as a prop so the picker can live in
 * the parent.
 */
export function CenterTopUpContent({ month }: Props) {
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const allMonths = month === ALL_MONTHS;

  const { data, isLoading } = useQuery<TopUpResponse>({
    queryKey: ["salary-center-topup", month],
    queryFn: async () => {
      const res = await api.get("/salary/monthly/center-topup", {
        params: {
          month: allMonths ? undefined : month || undefined,
          allMonths: allMonths ? "true" : undefined,
        },
      });
      return res.data;
    },
    staleTime: 0,
  });

  const isForecast = data?.isForecast ?? false;

  // A different month (or a new filter) is a different list — never leave the
  // reader on page 4 of a set that now has one page.
  useEffect(() => {
    setPage(1);
  }, [month, statusFilter, search]);

  const rows = useMemo(() => {
    // Students with nothing left to collect are never listed. They are not bad
    // data — the flag they carry is simply stale — but this list exists to
    // answer "who do I ring", and they are not an answer to it.
    let all = (data?.data ?? []).filter(hasDebt);
    if (statusFilter.length > 0)
      all = all.filter((r) => statusFilter.includes(r.student.status));
    // Client-side, unlike the debtors tab next door: that list is paged by the
    // server, this one already holds every row, so filtering here is instant
    // and costs no request. Matches the three things the row actually shows —
    // name, id, phone — with digits normalised so "+998 90 141 05 14",
    // "910410514" and "90 141" all find the same person.
    const q = search.trim().toLowerCase();
    if (q) {
      const digits = q.replace(/\D/g, "");
      all = all.filter((r) => {
        const name =
          `${r.student.firstName} ${r.student.lastName}`.toLowerCase();
        if (name.includes(q)) return true;
        if (String(r.student.id).includes(q.replace(/^#/, ""))) return true;
        return (
          digits.length > 0 &&
          (r.student.phone ?? "").replace(/\D/g, "").includes(digits)
        );
      });
    }
    return all;
  }, [data, statusFilter, search]);

  // EVERY figure on screen follows the filter — headline sums, footer and the
  // inactive warning alike. A header reporting the whole month next to a table
  // showing part of it reads as a contradiction rather than as context.
  const shown = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({
          centerPaid: t.centerPaid + r.centerPaid,
          centerUnrecovered: t.centerUnrecovered + r.centerUnrecovered,
          studentDebt: t.studentDebt + r.studentDebt,
          lessons: t.lessons + r.lessons,
          students: t.students + 1,
          inactive: t.inactive + (r.student.status === "ACTIVE" ? 0 : 1),
        }),
        {
          centerPaid: 0,
          centerUnrecovered: 0,
          studentDebt: 0,
          lessons: 0,
          students: 0,
          inactive: 0,
        },
      ),
    [rows],
  );
  const isFiltered = statusFilter.length > 0 || search.trim() !== "";

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
          : `${monthLabel(month)}da markaz qoplagan dars yo'q — bu oyda hali dars o'tilmagan yoki hamma o'quvchi to'lagan.`}
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
          label={isForecast ? "Markaz to'laydi" : "Markaz to'lagan"}
          value={`${formatPrice(shown.centerPaid)} so'm`}
          hint={
            isForecast
              ? "Oy yopilganda ustozlarga chiqadi — hali chiqmagan"
              : "Kassadan ustozlarga chiqqan pul"
          }
        />
        <SummaryCard
          tone="red"
          icon={<Wallet className="size-5 text-red-700 dark:text-red-300" />}
          label={isForecast ? "Qoplanishi kerak" : "Hali qaytmagan"}
          value={`${formatPrice(shown.centerUnrecovered)} so'm`}
          hint={
            isForecast
              ? "Oy yopilguncha undirilsa, markaz to'lamaydi"
              : "Chiqqan puldan hali undirilmagani"
          }
        />
        <SummaryCard
          tone="slate"
          icon={<Users className="size-5 text-slate-700 dark:text-slate-300" />}
          label="O'quvchilar"
          value={`${shown.students} ta`}
          hint={`${shown.lessons} ta dars ${isForecast ? "qoplanadi" : "qoplangan"}`}
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

      {isForecast && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>{monthLabel(month)} oyligi hali yopilmagan.</b> Darslar
            o&apos;tilgan, lekin markaz ustozlarga hali to&apos;lagani yo&apos;q
            — bu pul oy yopilganda chiqadi. Ya&apos;ni hozir undirilsa, markaz
            umuman to&apos;lamaydi.
          </span>
        </div>
      )}

      <p className="mb-4 text-xs text-muted-foreground">
        {allMonths ? "Butun davr" : monthLabel(month)}
        {isFiltered && " · filtrlangan"} · &laquo;Markaz hali
        olmagan&raquo; — jami qarzning markaz ustozlarga chiqarib bo&apos;lgan
        qismi. &laquo;Jami qarzi&raquo; esa o&apos;quvchining profilidagi to&apos;liq
        qarzi: unga markaz qoplamagan oldingi oylar ham kiradi, qaysilari
        ekani &laquo;⧉&raquo; nishonida.
        {!isFiltered && data.totals.repaidStudentCount > 0 && (
          <>
            {" "}
            Oylik sahifasidagi kartada {formatPrice(data.totals.centerPaid)}{" "}
            turibdi — farqi puli to&apos;liq qaytgan{" "}
            {data.totals.repaidStudentCount} o&apos;quvchi, ular bu
            ro&apos;yxatda ko&apos;rinmaydi.
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
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism, telefon yoki ID bo'yicha qidirish…"
            spellCheck={false}
            aria-label="Ro'yxat ichidan qidirish"
            className="pl-8"
          />
        </div>
        <MultiSelectCombobox
          options={STUDENT_STATUS_OPTIONS}
          selected={statusFilter}
          onChange={setStatusFilter}
          placeholder="Barcha holatlar"
          searchPlaceholder="Holat qidirish..."
          className="w-auto min-w-[160px]"
        />
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
              <TableHead>
                {isForecast ? "Qoplanadigan oylar" : "Markaz qoplagan oylar"}
              </TableHead>
              <TableHead className="text-right">Darslar</TableHead>
              {/* ONE money column per row, deliberately. The centre's spend
                  used to sit beside it and read as a second thing to collect:
                  #10593 showed "markaz 16 667" next to "qarzi 329" and the
                  question it produced every time was why we were chasing 329
                  after paying out 16 667. The answer — the student had already
                  paid 33 004 of the lesson, so the advance came back with it —
                  is a fact about the past, and an admin ringing someone needs
                  only the figure they will read out. The spend stays on the
                  summary card above, where it is a company total, not an
                  instruction. */}
              <TableHead className="border-l text-right">
                {isForecast ? "Markaz to'laydi" : "Markaz hali olmagan"}
              </TableHead>
              {/* The whole the column before it is a part of. An admin on the
                  phone asks for the DEBT, not for the centre's share of it, and
                  that debt routinely predates the top-up era: production August
                  2026 fronted July only, while #10050's 633 323 dates to May.
                  The badge opens the month-by-month split, because a single
                  figure spanning four months reads as one month's arrears. */}
              <TableHead className="border-l text-right">
                Jami qarzi
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
                  {search.trim()
                    ? `«${search.trim()}» bo'yicha hech kim topilmadi.`
                    : "Bu holatda o'quvchi yo'q — filtrni o'zgartirib ko'ring."}
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
                          title={`${monthLabel(m.monthKey)}: ${m.lessons} dars`}
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
                  {/* Always > 0 — a zero-debt row never reaches here. The badge
                      appears only when the debt spans more than one month, so
                      the single figure is never read as one month's arrears. */}
                  <TableCell className="border-l text-right font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {formatPrice(r.centerUnrecovered)}
                  </TableCell>
                  <TableCell className="border-l text-right">
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
                <TableCell className="border-l text-right font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {formatPrice(shown.centerUnrecovered)}
                </TableCell>
                <TableCell className="border-l text-right font-semibold tabular-nums text-red-600 dark:text-red-400">
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
