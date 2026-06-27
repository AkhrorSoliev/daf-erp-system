"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { PossibleDeductionsInfo } from "@/components/payments/possible-deductions-info";

interface SalarySummary {
  expectedMonthly: number;
  actualEarned: number;
  accrualCount: number;
  paidTotal: number;
  advancesTotal?: number;
  advancesPending?: number;
  groups: Array<{
    groupId: string;
    groupName: string;
    activeStudents: number;
    lessonsPerMonth: number;
    salaryType: string | null;
    salaryValue: number;
    expectedPerLesson: number;
    expectedMonthly: number;
  }>;
  hasConfig: boolean;
  isFixedMonthly: boolean;
}

interface BreakdownLine {
  id: string;
  lessonDate: string;
  student: { id: number; firstName: string; lastName: string };
  group: { id: string; name: string };
  perLessonCost: number;
  amount: number;
  configVersion: {
    salaryType: string;
    value: number;
    scope: "GROUP" | "GLOBAL";
  } | null;
  isCarriedOver?: boolean;
  creditPeriodDate?: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
}

interface BreakdownResponse {
  period: { periodStart: string; periodEnd: string };
  lines: BreakdownLine[];
  totals: {
    accrualCount: number;
    amountTotal: number;
    reversedCount: number;
    reversedTotal: number;
    carriedOverCount: number;
    carriedOverTotal: number;
  };
}

const fmtSom = (v: number) => `${v.toLocaleString("uz-UZ")} so'm`;

export function TeacherSalaryClient() {
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["teacher-salary-summary"],
    queryFn: () =>
      api.get<SalarySummary>("/salary/me/summary").then((r) => r.data),
  });

  const { data: breakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ["teacher-current-cycle-breakdown"],
    queryFn: () =>
      api
        .get<BreakdownResponse>("/salary/me/current-cycle/breakdown")
        .then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mening oyligim</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Joriy davrdagi kutilayotgan va real oyligingiz hisoboti
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Kutilayotgan oylik</CardDescription>
            <CardTitle className="text-2xl">
              {summaryLoading ? (
                <Skeleton className="h-7 w-32" />
              ) : (
                fmtSom(summary?.expectedMonthly ?? 0)
              )}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Real ishlangan</CardDescription>
            <CardTitle className="text-2xl">
              {summaryLoading ? (
                <Skeleton className="h-7 w-32" />
              ) : (
                fmtSom(summary?.actualEarned ?? 0)
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!summaryLoading && summary?.accrualCount !== undefined && (
              <p className="text-xs text-muted-foreground">
                {summary.accrualCount} ta dars uchun yozilgan
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bugungacha berilgan</CardDescription>
            <CardTitle className="text-2xl">
              {summaryLoading ? (
                <Skeleton className="h-7 w-32" />
              ) : (
                fmtSom(
                  (summary?.paidTotal ?? 0) + (summary?.advancesTotal ?? 0),
                )
              )}
            </CardTitle>
          </CardHeader>
          {!summaryLoading && (summary?.advancesTotal ?? 0) > 0 && (
            <CardContent className="space-y-0.5 text-xs text-muted-foreground">
              <p>
                Oylik: {fmtSom(summary?.paidTotal ?? 0)} · Avans:{" "}
                {fmtSom(summary?.advancesTotal ?? 0)}
              </p>
              {(summary?.advancesPending ?? 0) > 0 && (
                <p className="text-amber-600">
                  {fmtSom(summary?.advancesPending ?? 0)} avans hali oylikdan
                  ushlanmagan
                </p>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* Per-group breakdown */}
      {!summary?.isFixedMonthly && (
        <Card>
          <CardHeader>
            <CardTitle>Guruhlar bo&apos;yicha kutilayotgan oylik</CardTitle>
            <CardDescription>
              Aktiv o&apos;quvchilar soni × foiz/qoida × bir oydagi darslar
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !summary?.groups.length ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                Sizga biriktirilgan aktiv guruh yo&apos;q
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 border-r">#</TableHead>
                    <TableHead>Guruh</TableHead>
                    <TableHead>Aktiv o&apos;quvchilar</TableHead>
                    <TableHead>Oylik darslar</TableHead>
                    <TableHead>Foiz / qoida</TableHead>
                    <TableHead className="text-right">Oylik</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.groups.map((g, i) => (
                    <TableRow key={g.groupId}>
                      <TableCell className="border-r text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">{g.groupName}</TableCell>
                      <TableCell>{g.activeStudents}</TableCell>
                      <TableCell>{g.lessonsPerMonth}</TableCell>
                      <TableCell>
                        {g.salaryType === "PERCENTAGE"
                          ? `${g.salaryValue}%`
                          : g.salaryType
                            ? fmtSom(g.salaryValue)
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtSom(g.expectedMonthly)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Current-cycle breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Joriy davr — har dars uchun batafsil</CardTitle>
          <CardDescription>
            {breakdown
              ? `${format(new Date(breakdown.period.periodStart), "dd.MM.yyyy")} — ${format(new Date(breakdown.period.periodEnd), "dd.MM.yyyy")}`
              : "Yuklanyapti..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {breakdownLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !breakdown?.lines.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              Hozircha bu davrda yozilgan oylik yo&apos;q
            </p>
          ) : (
            <BreakdownTable lines={breakdown.lines} totals={breakdown.totals} />
          )}
        </CardContent>
      </Card>

      <PossibleDeductionsInfo variant="teacher" />
    </div>
  );
}

function BreakdownTable({
  lines,
  totals,
}: {
  lines: BreakdownLine[];
  totals: BreakdownResponse["totals"];
}) {
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>Sana</TableHead>
            <TableHead>O&apos;quvchi</TableHead>
            <TableHead>Guruh</TableHead>
            <TableHead>Dars narxi</TableHead>
            <TableHead>Foiz / qoida</TableHead>
            <TableHead className="text-right">Yozilgan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l, i) => (
            <TableRow
              key={l.id}
              className={l.reversedAt ? "opacity-60 line-through" : ""}
            >
              <TableCell className="border-r text-muted-foreground">
                {i + 1}
              </TableCell>
              <TableCell>{format(new Date(l.lessonDate), "dd.MM.yyyy")}</TableCell>
              <TableCell>
                {l.student.firstName} {l.student.lastName}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>{l.group.name}</span>
                  {l.isCarriedOver && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 h-4 no-underline border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300"
                    >
                      Oldingi oydan
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>{l.perLessonCost.toLocaleString("uz-UZ")}</TableCell>
              <TableCell>
                {l.configVersion ? (
                  <Badge variant="outline">
                    {l.configVersion.salaryType === "PERCENTAGE"
                      ? `${l.configVersion.value}%`
                      : `${l.configVersion.value.toLocaleString("uz-UZ")}/cycle`}
                    {l.configVersion.scope === "GROUP" && " (guruh)"}
                  </Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right font-medium">
                {l.amount.toLocaleString("uz-UZ")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-col gap-1 text-sm pt-2 border-t">
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            Aktiv yozuvlar ({totals.accrualCount} ta):
          </span>
          <span className="font-medium">
            {totals.amountTotal.toLocaleString("uz-UZ")} so&apos;m
          </span>
        </div>
        {totals.carriedOverCount > 0 && (
          <div className="flex justify-between text-purple-700 dark:text-purple-300">
            <span>
              Shundan oldingi oydan ({totals.carriedOverCount} ta dars):
            </span>
            <span className="font-medium">
              {totals.carriedOverTotal.toLocaleString("uz-UZ")} so&apos;m
            </span>
          </div>
        )}
        {totals.reversedCount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Bekor qilingan ({totals.reversedCount} ta):</span>
            <span>
              {totals.reversedTotal.toLocaleString("uz-UZ")} so&apos;m
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
