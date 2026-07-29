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
import { useAuth } from "@/hooks/use-auth";
import { PossibleDeductionsInfo } from "@/components/payments/possible-deductions-info";
import { SalaryMonthlyPanel } from "@/components/shared/salary-monthly-panel";

/**
 * Group context only — no money. Every salary figure on this page comes from
 * `SalaryMonthlyPanel`, i.e. the same report the administration reads.
 */
interface SalarySummary {
  groups: Array<{
    groupId: string;
    groupName: string;
    activeStudents: number;
    salaryType: string | null;
    salaryValue: number;
    coursePrice: number;
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
  const userId = useAuth((s) => s.user?.id) ?? 0;

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

      {/* The money — the same row the administration sees on /payments/salary. */}
      <SalaryMonthlyPanel userId={userId} scope="me" />

      {/* Per-group context */}
      {!summary?.isFixedMonthly && (
        <Card>
          <CardHeader>
            <CardTitle>Guruhlaringiz</CardTitle>
            <CardDescription>
              Har bir guruhdagi aktiv o&apos;quvchilar soni va stavkangiz
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
                    <TableHead>Foiz / qoida</TableHead>
                    <TableHead className="text-right">Kurs narxi</TableHead>
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
                      <TableCell>
                        {g.salaryType === "PERCENTAGE"
                          ? `${g.salaryValue}%`
                          : g.salaryType
                            ? fmtSom(g.salaryValue)
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtSom(g.coursePrice)}
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
