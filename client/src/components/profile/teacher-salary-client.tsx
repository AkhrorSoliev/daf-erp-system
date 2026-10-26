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
import { useT } from "@/i18n/context";
import { useAuth } from "@/hooks/use-auth";
import {
  breakdownRateLabel,
  type RateBasis,
} from "@/components/payments/salary-utils";
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
  rateBasis: RateBasis;
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

const fmtSom = (v: number, t: (s: string) => string) =>
  `${v.toLocaleString("uz-UZ")} ${t("so'm")}`;

export function TeacherSalaryClient() {
  const t = useT();
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
        <h1 className="text-2xl font-bold">{t("Mening oyligim")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("Joriy davrdagi kutilayotgan va real oyligingiz hisoboti")}
        </p>
      </div>

      {/* The money — the same row the administration sees on /payments/salary. */}
      <SalaryMonthlyPanel userId={userId} scope="me" />

      {/* Per-group context */}
      {!summary?.isFixedMonthly && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Guruhlaringiz")}</CardTitle>
            <CardDescription>
              {t("Har bir guruhdagi aktiv o'quvchilar soni va stavkangiz")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !summary?.groups.length ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                {t("Sizga biriktirilgan aktiv guruh yo'q")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 border-r">#</TableHead>
                    <TableHead>{t("Guruh")}</TableHead>
                    <TableHead>{t("Aktiv o'quvchilar")}</TableHead>
                    <TableHead>{t("Foiz / qoida")}</TableHead>
                    <TableHead className="text-right">{t("Kurs narxi")}</TableHead>
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
                            ? fmtSom(g.salaryValue, t)
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtSom(g.coursePrice, t)}
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
          <CardTitle>{t("Joriy davr — har dars uchun batafsil")}</CardTitle>
          <CardDescription>
            {breakdown
              ? `${format(new Date(breakdown.period.periodStart), "dd.MM.yyyy")} — ${format(new Date(breakdown.period.periodEnd), "dd.MM.yyyy")}`
              : t("Yuklanyapti...")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {breakdownLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !breakdown?.lines.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              {t("Hozircha bu davrda yozilgan oylik yo'q")}
            </p>
          ) : (
            <BreakdownTable lines={breakdown.lines} totals={breakdown.totals} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function BreakdownTable({
  lines,
  totals,
}: {
  lines: BreakdownLine[];
  totals: BreakdownResponse["totals"];
}) {
  const t = useT();
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>{t("Sana")}</TableHead>
            <TableHead>{t("O'quvchi")}</TableHead>
            <TableHead>{t("Guruh")}</TableHead>
            <TableHead>{t("Dars narxi")}</TableHead>
            <TableHead>{t("Foiz / qoida")}</TableHead>
            <TableHead className="text-right">{t("Yozilgan")}</TableHead>
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
                      {t("Oldingi oydan")}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>{l.perLessonCost.toLocaleString("uz-UZ")}</TableCell>
              <TableCell>
                {l.configVersion ? (
                  <Badge variant="outline">
                    {l.configVersion.scope === "GROUP"
                      ? t("{rate} (guruh)", {
                          rate: breakdownRateLabel(l.configVersion, l.rateBasis, t),
                        })
                      : breakdownRateLabel(l.configVersion, l.rateBasis, t)}
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
            {t("Aktiv yozuvlar ({n} ta):", { n: totals.accrualCount })}
          </span>
          <span className="font-medium">
            {totals.amountTotal.toLocaleString("uz-UZ")} {t("so'm")}
          </span>
        </div>
        {totals.carriedOverCount > 0 && (
          <div className="flex justify-between text-purple-700 dark:text-purple-300">
            <span>
              {t("Shundan oldingi oydan ({n} ta dars):", {
                n: totals.carriedOverCount,
              })}
            </span>
            <span className="font-medium">
              {totals.carriedOverTotal.toLocaleString("uz-UZ")} {t("so'm")}
            </span>
          </div>
        )}
        {totals.reversedCount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>{t("Bekor qilingan ({n} ta):", { n: totals.reversedCount })}</span>
            <span>
              {totals.reversedTotal.toLocaleString("uz-UZ")} {t("so'm")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
