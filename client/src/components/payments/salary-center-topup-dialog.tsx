"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, HandCoins } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { monthLabel } from "./salary-utils";

interface TopUpRow {
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
  /** Still to collect FOR THIS MONTH — min(debt today, this month's lessons). */
  studentDebt: number;
  /** This month's fronted lessons at their frozen price. Not rendered. */
  studentOwed: number;
  /** The student's whole debt, every month. Not rendered. */
  totalDebt: number;
  groups: { id: string; name: string }[];
  teachers: { id: number; name: string }[];
  firstLesson: string;
  lastLesson: string;
}

interface TopUpResponse {
  month: string;
  data: TopUpRow[];
  totals: {
    centerPaid: number;
    studentDebt: number;
    studentOwed: number;
    lessonCount: number;
    studentCount: number;
    inactiveStudentCount: number;
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
 * anything", so that is what decides. An earlier version graded this three ways
 * (paid / partly paid / unpaid) by comparing the balance against what the month's
 * lessons cost — but those two are not comparable quantities, and the grade was
 * as confusing as the column it came from. Debt or no debt is the whole question.
 */
const hasDebt = (r: TopUpRow) => r.studentDebt > 0;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The month whose card was clicked — the dialog never picks its own. */
  month: string;
  /** Kept in sync with the table's search so the dialog foots to the card. */
  search: string;
}

/**
 * "Qolgan (markaz)" — the students behind the number.
 *
 * The card says how much the center is still out of pocket for teacher pay it
 * fronted; this says from whom to get it back. It deliberately shows TWO sums:
 * `centerPaid` (what the center spent — the teacher's share of each lesson) and
 * `studentOwed` (what the student owes for those same lessons — the full lesson
 * price). They differ by roughly 2×, and collecting the second is what makes
 * the first whole, so showing only one answers the wrong question.
 */
export function SalaryCenterTopUpDialog({
  open,
  onOpenChange,
  month,
  search,
}: Props) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery<TopUpResponse>({
    queryKey: ["salary-center-topup", month, search],
    queryFn: async () => {
      const res = await api.get("/salary/monthly/center-topup", {
        params: { month: month || undefined, search: search || undefined },
      });
      return res.data;
    },
    enabled: open,
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
    // answer "who do I ring", and they are not an answer to it. There is no
    // toggle to bring them back: a control whose only effect is to add rows
    // nobody can act on is a control that has to be explained forever.
    let all = (data?.data ?? []).filter(hasDebt);
    if (statusFilter !== "all")
      all = all.filter((r) => r.student.status === statusFilter);
    return all;
  }, [data, statusFilter]);

  // EVERY figure on screen follows the FILTER — the two headline sums, the
  // footer and the inactive warning alike. A reader who narrowed to
  // "Muzlatilgan" is asking what that slice is worth, and a header still
  // reporting the whole month next to a table showing part of it reads as a
  // contradiction rather than as context.
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

  // How much of the card's "Qolgan (markaz)" has, by the balance, already come
  // back. Computed over the WHOLE response, not the filtered rows — it is a
  // statement about the figure on the card, which the filter does not change.
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="size-5 text-amber-600" />
            Markaz qo&apos;shimchasi — kimdan undirish kerak
          </DialogTitle>
          <DialogDescription>
            {monthLabel(month)} — markaz shu o&apos;quvchilar to&apos;lamagan
            darslar uchun ustozlarga pul to&apos;lab bergan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !data || data.data.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Bu oyda markaz qoplagan, hali qaytmagan dars yo&apos;q — hammasi
              undirilgan.
            </div>
          ) : (
            <>
              {/* The two sums, side by side. Keeping them apart is the point:
                  one is the center's cost, the other is what to collect. */}
              <div className="mb-4 grid gap-4 rounded-md border bg-muted/20 p-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">
                    Markaz ustozlarga to&apos;lagan
                    {isFiltered && <span className="ml-1">— tanlangan</span>}
                  </div>
                  <div className="text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {formatPrice(shown.centerPaid)} so&apos;m
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {shown.students} o&apos;quvchi · {shown.lessons} dars
                    {/* The card reports the raw flag and this list does not, so
                        the gap gets one line. Without it the two numbers look
                        like a bug; with more than a line it reads as an excuse. */}
                    {alreadyBack.count > 0 && (
                      <span>
                        {" "}
                        · kartada {formatPrice(data.totals.centerPaid)} —
                        farqi puli qaytgan {alreadyBack.count} o&apos;quvchi
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    O&apos;quvchilardan olinishi kerak
                    {isFiltered && <span className="ml-1">— tanlangan</span>}
                  </div>
                  <div className="text-xl font-semibold tabular-nums text-red-600 dark:text-red-400">
                    {formatPrice(shown.studentDebt)} so&apos;m
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Faqat {monthLabel(month)} darslaridan qolgani. Boshqa
                    oylarning qarzi bu yerga kirmaydi — oyni almashtirsangiz,
                    raqam ham o&apos;sha oyniki bo&apos;ladi.
                  </div>
                </div>
              </div>

              {shown.inactive > 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {shown.inactive} ta o&apos;quvchi faol emas (muzlatilgan /
                    chetlatilgan / arxiv). Ular darsga kelmaydi, ya&apos;ni bu
                    pul o&apos;z-o&apos;zidan qaytmaydi — ular bilan
                    bog&apos;lanish kerak.
                  </span>
                </div>
              )}

              {/* Two independent questions, so two selects: "is this student
                  still with us" and "has their money come back". Folding them
                  into one list would make the pair unselectable together, and
                  the useful call list is exactly the intersection. */}
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
                      <TableHead className="text-right">Darslar</TableHead>
                      {/* Two columns, two questions — nothing else. The month's
                          lesson price used to sit between them and was neither:
                          not what the center spent, not what anyone owes now. */}
                      <TableHead className="text-right">
                        Markaz ustozga to&apos;lagan
                      </TableHead>
                      <TableHead className="text-right">
                        Shu oydan qolgan qarzi
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          Bu holatda o&apos;quvchi yo&apos;q — filtrni
                          o&apos;zgartirib ko&apos;ring.
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
                                {r.student.phone
                                  ? ` · +998 ${r.student.phone}`
                                  : ""}
                              </span>
                              {r.student.status !== "ACTIVE" && (
                                <Badge
                                  variant="outline"
                                  className="px-1 py-0 text-[10px] font-normal"
                                >
                                  {STATUS_LABELS[r.student.status] ??
                                    r.student.status}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.groups.map((g) => g.name).join(", ")}
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(r.firstLesson), "dd.MM")} —{" "}
                              {format(new Date(r.lastLesson), "dd.MM.yyyy")}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.lessons}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-amber-700 dark:text-amber-400">
                            {formatPrice(r.centerPaid)}
                          </TableCell>
                          {/* Always > 0 — a zero-debt row never reaches here. */}
                          <TableCell className="text-right font-semibold tabular-nums text-red-600 dark:text-red-400">
                            {formatPrice(r.studentDebt)}
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
            </>
          )}
        </div>

        {!isLoading && rows.length > 0 && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t px-6 py-3 text-sm">
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
              <span className="text-muted-foreground">
                Jami {rows.length} ta
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-1 disabled:opacity-50"
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
                className="rounded-md border px-3 py-1 disabled:opacity-50"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Keyingi
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
