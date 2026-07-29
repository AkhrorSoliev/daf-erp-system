"use client";

import Link from "next/link";
import { GroupStudentsHoverCard } from "@/components/shared/group-students-hover-card";
import { formatPrice } from "@/lib/format-utils";

/**
 * `GET /teachers/:id/salary-summary` — group CONTEXT for the salary tab.
 *
 * Deliberately carries no monthly money: every figure the profile shows comes
 * from `SalaryMonthlyPanel` (the `/payments/salary` report). This endpoint used
 * to return an `expectedMonthly` forecast that contradicted it.
 */
export interface SalaryGroupsSummary {
  groups: {
    groupId: number;
    groupName: string;
    activeStudents: number;
    salaryType: string | null;
    salaryValue: number;
    coursePrice: number;
  }[];
  hasConfig: boolean;
}

function rateLabel(type: string | null, value: number): string {
  if (!type) return "";
  if (type === "PERCENTAGE") return `${value}%`;
  if (type === "FIXED_MONTHLY") return `${formatPrice(value)} so'm/oy`;
  return `${formatPrice(value)} so'm`;
}

/**
 * Which groups the teacher runs, how many active students each has, and on
 * what rate — the context behind the monthly salary figure above it.
 */
export function TeacherGroupsRateList({
  summary,
}: {
  summary: SalaryGroupsSummary;
}) {
  return (
    <div className="space-y-4">
      {summary.groups.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Guruhlar bo&apos;yicha</h4>
          <div className="space-y-2">
            {summary.groups.map((g) => (
              <div
                key={g.groupId}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <GroupStudentsHoverCard groupId={g.groupId}>
                    <Link
                      href={`/groups/${g.groupId}`}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {g.groupName}
                    </Link>
                  </GroupStudentsHoverCard>
                  <p className="text-xs text-muted-foreground">
                    {g.activeStudents} o&apos;quvchi
                    {g.salaryType
                      ? ` · ${rateLabel(g.salaryType, g.salaryValue)}`
                      : ""}
                    {` · kurs ${formatPrice(g.coursePrice)} so'm`}
                  </p>
                </div>
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
    </div>
  );
}
