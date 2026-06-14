"use client";

import Link from "next/link";
import { PossibleDeductionsInfo } from "@/components/payments/possible-deductions-info";

export interface SalarySummary {
  expectedMonthly: number;
  actualEarned: number;
  accrualCount: number;
  lessonsCount?: number;
  studentsCount?: number;
  paidTotal: number;
  groups: {
    groupId: number;
    groupName: string;
    activeStudents: number;
    salaryType: string | null;
    salaryValue: number;
    coursePrice: number;
    expectedMonthly: number;
  }[];
  hasConfig: boolean;
}

interface SalarySummaryViewProps {
  summary: SalarySummary;
}

/**
 * Ish haqi (oylik) xulosasini ko'rsatadigan umumiy ko'rinish.
 * O'qituvchi profili ham, xodim profili ham shu komponentdan foydalanadi
 * (`GET /teachers/:id/salary-summary` javobini render qiladi).
 */
export function SalarySummaryView({ summary }: SalarySummaryViewProps) {
  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-xs text-muted-foreground">Kutilayotgan (oylik)</p>
          <p className="text-lg font-bold text-amber-600">
            {summary.expectedMonthly.toLocaleString("en-US")} so&apos;m
          </p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-xs text-muted-foreground">Haqiqiy yig&apos;ilgan</p>
          <p className="text-lg font-bold text-green-600">
            {summary.actualEarned.toLocaleString("en-US")} so&apos;m
          </p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-xs text-muted-foreground">O&apos;tilgan darslar</p>
          <p className="text-lg font-bold">
            {summary.lessonsCount ?? 0}
            <span className="text-xs font-normal text-muted-foreground"> ta dars</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {summary.studentsCount ?? 0} ta o&apos;quvchi qatnashdi
          </p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-xs text-muted-foreground">Jami to&apos;langan</p>
          <p className="text-lg font-bold">
            {summary.paidTotal.toLocaleString("en-US")} so&apos;m
          </p>
        </div>
      </div>

      {/* Per-group breakdown */}
      {summary.groups.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Guruhlar bo&apos;yicha</h4>
          <div className="space-y-2">
            {summary.groups.map((g) => (
              <div
                key={g.groupId}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <Link
                    href={`/groups/${g.groupId}`}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {g.groupName}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {g.activeStudents} o&apos;quvchi
                    {g.salaryType
                      ? ` · ${g.salaryType === "PERCENTAGE" ? `${g.salaryValue}%` : `${g.salaryValue.toLocaleString("en-US")} so'm`}`
                      : ""}
                    {` · ${g.coursePrice.toLocaleString("en-US")} so'm`}
                  </p>
                </div>
                <p className="font-medium text-amber-600">
                  ~{g.expectedMonthly.toLocaleString("en-US")} so&apos;m/oy
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!summary.hasConfig && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          Bu xodim uchun oylik konfiguratsiyasi belgilanmagan. Moliya
          bo&apos;limidan sozlang.
        </div>
      )}

      <PossibleDeductionsInfo variant="teacher" />
    </div>
  );
}
