"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";

interface DeductionCoverage {
  cycleSequenceNumber: number;
  coveredCount: number;
  capacity: number;
  firstCoveredDate: string | null;
  lastCoveredDate: string | null;
}

interface TrailRow {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  metadata: { mode?: string; perLessonCost?: number; lessonsCovered?: number } | null;
  contractNumber: string | null;
  paymentMethod: string | null;
  paymentReceipt: string | null;
  lessonDate: string | null;
  groupName: string | null;
  courseName: string | null;
  isReversal: boolean;
  performedBy: { id: number; firstName: string; lastName: string } | null;
  createdAt: string;
  coverage: DeductionCoverage | null;
}

interface TrailResponse {
  data: TrailRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface Props {
  studentId: number;
}

const typeLabels: Record<string, string> = {
  LESSON_DEDUCTION: "Pul yechildi (oldindan)",
  LESSON_CONSUMPTION: "Dars o'tildi",
};

const typeColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  LESSON_DEDUCTION: "secondary",
  LESSON_CONSUMPTION: "outline",
};

const fmtSom = (v: number) => {
  if (v === 0) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString("uz-UZ")}`;
};

/**
 * Per-student "where did each so'm go for lessons?" report. Strictly scoped
 * to LESSON_DEDUCTION (the prepaid-batch allocation row) and
 * LESSON_CONSUMPTION (the per-lesson use rows). Money-flow rows
 * (PAYMENT/REFUND/ADJUSTMENT/INITIAL_BALANCE) live on the "To'lovlar" tab.
 */
export function LessonTrailTab({ studentId }: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useQuery({
    queryKey: ["student-lesson-trail", studentId, page, pageSize],
    queryFn: () =>
      api
        .get<TrailResponse>(`/transactions/student/${studentId}/lesson-trail`, {
          params: { page, pageSize },
        })
        .then((r) => r.data),
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Darslar</CardTitle>
        <CardDescription>
          Talabaning sarflangan darslari va ularni qoplagan to&apos;lov
          batchlari xronologik tartibda
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !rows.length ? (
          <p className="text-muted-foreground text-sm py-4 text-center">
            Hozircha sarflangan dars yo&apos;q
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead>Turi</TableHead>
                  <TableHead>Tafsilot</TableHead>
                  <TableHead>Guruh / Kurs</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                  <TableHead className="text-right">Balans</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id} className={r.isReversal ? "opacity-60" : ""}>
                    <TableCell className="border-r text-muted-foreground">
                      {(page - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(r.createdAt), "dd.MM.yyyy, HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeColors[r.type] ?? "secondary"}>
                        {typeLabels[r.type] ?? r.type}
                      </Badge>
                      {r.isReversal && (
                        <Badge variant="outline" className="ml-1">
                          Bekor
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{r.description ?? "—"}</div>
                      {r.type === "LESSON_DEDUCTION" && (r.metadata?.mode || r.coverage) && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                          {r.coverage && r.metadata?.mode !== "SINGLE_UNCOVERED" && (
                            <Badge variant="outline" className="font-mono">
                              Sikl #{r.coverage.cycleSequenceNumber}
                            </Badge>
                          )}
                          {r.metadata?.mode === "FULL_CYCLE" && (
                            <span className="text-muted-foreground">
                              To&apos;liq tsikl ({r.metadata.lessonsCovered} dars)
                            </span>
                          )}
                          {r.metadata?.mode === "PARTIAL" && (
                            <span className="text-amber-700 dark:text-amber-400">
                              Qisman ({r.metadata.lessonsCovered} dars)
                            </span>
                          )}
                          {r.metadata?.mode === "SINGLE_UNCOVERED" && (
                            <span className="text-red-700 dark:text-red-400">
                              Qarz darsi (1 dars)
                            </span>
                          )}
                        </div>
                      )}
                      {r.coverage && r.coverage.coveredCount > 0 && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Qopladi:{" "}
                          <span className="font-medium text-foreground">
                            {r.coverage.firstCoveredDate &&
                              format(new Date(r.coverage.firstCoveredDate), "dd.MM")}
                            {r.coverage.firstCoveredDate !== r.coverage.lastCoveredDate &&
                              ` → ${r.coverage.lastCoveredDate ? format(new Date(r.coverage.lastCoveredDate), "dd.MM") : ""}`}
                          </span>{" "}
                          ({r.coverage.coveredCount}/{r.coverage.capacity} dars)
                        </div>
                      )}
                      {r.coverage && r.coverage.coveredCount === 0 && r.coverage.capacity > 0 && (
                        <div className="mt-0.5 text-xs text-muted-foreground italic">
                          Hali dars qoplanmagan (0/{r.coverage.capacity})
                        </div>
                      )}
                      {r.contractNumber && (
                        <div className="text-xs text-muted-foreground">
                          {r.contractNumber}
                        </div>
                      )}
                      {r.type === "LESSON_CONSUMPTION" && r.lessonDate && (
                        <div className="text-xs text-muted-foreground">
                          Dars sanasi: {format(new Date(r.lessonDate), "dd.MM.yyyy")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.groupName ? (
                        <>
                          <div>{r.groupName}</div>
                          {r.courseName && (
                            <div className="text-xs text-muted-foreground">
                              {r.courseName}
                            </div>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        r.amount > 0
                          ? "text-green-600 dark:text-green-400"
                          : r.amount < 0
                            ? "text-red-600 dark:text-red-400"
                            : ""
                      }`}
                    >
                      {fmtSom(r.amount)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {r.balanceAfter.toLocaleString("uz-UZ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Paginatsiya */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-sm text-muted-foreground">
                Jami: <strong>{total}</strong> ta yozuv
              </div>

              <div className="flex items-center gap-3">
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 40, 50].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} / sahifa
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-sm min-w-[80px] text-center">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
