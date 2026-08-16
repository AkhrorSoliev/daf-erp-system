"use client";

import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { positionLabel } from "./salary-utils";

export interface StaffConfigRow {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    roles: { id: number; name: string }[];
    position: string | null;
    isActive: boolean;
    branch: { id: number; name: string } | null;
  };
  configs: {
    id: string;
    salaryType: string;
    value: number;
    groupId: string | null;
    group: { id: string; name: string } | null;
  }[];
}

interface Props {
  /** Shared with the teacher list above — one search box drives both. */
  search: string;
  /** Bumped by the parent after a rate is saved. */
  refreshKey: number;
  enabled: boolean;
  onEdit: (row: StaffConfigRow) => void;
}

/**
 * "Xodimlar stavkalari" — the non-teaching payroll (administrator, cashier,
 * branch director, CEO) inside the ⚙ Sozlamalar sheet.
 *
 * The monthly report has had a "Xodimlar oyligi" section since July 2026, but
 * it only lists staff who have a FIXED_MONTHLY rate — and until this list there
 * was nowhere to set one. `/salary/overview` (the teacher list above) is
 * teacher-only, so the report's empty state pointed the CEO at a screen where
 * no staff member appeared, and production ran with 13 employees and zero
 * salary configs. This is the missing half.
 *
 * Rate-less staff sort first (server-side): they are the only rows that need
 * an action, and finding them is the reason to open this list.
 */
export function SalaryStaffConfigList({
  search,
  refreshKey,
  enabled,
  onEdit,
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["salary-staff-config", search, refreshKey, enabled],
    enabled,
    queryFn: () =>
      api
        .get<{ data: StaffConfigRow[] }>("/salary/staff-config", {
          params: { search: search || undefined },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  const rows = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="divide-y rounded-md border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-3">
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Xodim topilmadi.
      </div>
    );
  }

  return (
    <div className="divide-y rounded-md border">
      {rows.map((row) => (
        <div key={row.user.id} className="flex items-center gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {row.user.firstName} {row.user.lastName}
              </span>
              {/* Shown, not hidden: a deactivated employee's final prorated
                  month is still payable, so they must stay editable. */}
              {!row.user.isActive && (
                <Badge variant="outline" className="text-xs font-normal">
                  Nofaol
                </Badge>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted-foreground">
                {positionLabel(row.user)}
                {row.user.branch ? ` · ${row.user.branch.name}` : ""}
              </span>
              {row.configs.length === 0 ? (
                <Badge
                  variant="outline"
                  className="border-amber-300 text-xs font-normal text-amber-700 dark:text-amber-400"
                >
                  Belgilanmagan
                </Badge>
              ) : (
                row.configs.map((c) => (
                  <Badge
                    key={c.id}
                    variant="secondary"
                    className="text-xs font-normal"
                  >
                    {c.salaryType === "PERCENTAGE"
                      ? `Foiz: ${c.value}%`
                      : `Oylik: ${formatPrice(c.value)} so'm`}
                  </Badge>
                ))
              )}
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={() => onEdit(row)}
            aria-label="Stavkani tahrirlash"
          >
            <Pencil className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
