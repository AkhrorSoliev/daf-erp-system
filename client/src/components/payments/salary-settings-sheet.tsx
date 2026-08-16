"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { SalaryPeriodControl } from "./salary-period-control";
import { SalaryConfigRowSheet } from "./salary-config-row-sheet";
import { SalaryConfigBulkDialog } from "./salary-config-bulk-dialog";
import { SalaryStaffConfigList } from "./salary-staff-config-list";

interface OverviewConfig {
  id: string;
  salaryType: string;
  value: number;
  groupId: string | null;
  group: { id: string; name: string } | null;
}
interface OverviewRow {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    branch: { id: number; name: string } | null;
  };
  configs: OverviewConfig[];
}
interface OverviewResponse {
  data: OverviewRow[];
}

const SALARY_TYPE_SHORT: Record<string, string> = {
  PERCENTAGE: "Foiz",
  FIXED_PER_STUDENT: "O'quvchi boshiga",
  FIXED_MONTHLY: "Oylik",
};
const TEACHER_ROLE = { id: 4, name: "Teacher" };

/**
 * What `SalaryConfigRowSheet` needs. Held whole rather than as an id because
 * the two lists below come from different endpoints — resolving an id back to
 * a row would mean asking "which list was it in?" on every render.
 */
interface EditTarget {
  id: number;
  firstName: string;
  lastName: string;
  branches: { id: number; name: string }[];
  roles: { id: number; name: string }[];
  position: string | null;
}

const toEditTarget = (
  user: {
    id: number;
    firstName: string;
    lastName: string;
    branch: { id: number; name: string } | null;
    position?: string | null;
  },
  roles: { id: number; name: string }[],
): EditTarget => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  branches: user.branch ? [user.branch] : [],
  roles,
  position: user.position ?? null,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: {
    periodStart: string;
    periodEnd: string;
    cycleStartDay: number;
  } | null;
  onChanged: () => void;
}

/**
 * ⚙ Sozlamalar — CEO-only surface for the salary *rules* (rate config per
 * teacher + the cycle start day), kept OUT of the monthly report which is
 * display-only. Reuses the existing config row sheet / bulk dialog / period
 * control verbatim.
 */
export function SalarySettingsSheet({
  open,
  onOpenChange,
  period,
  onChanged,
}: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [bulkType, setBulkType] = useState<"percent" | "monthly" | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["salary-config-list", search, refreshKey, open],
    enabled: open,
    queryFn: () =>
      api
        .get<OverviewResponse>("/salary/overview", {
          params: { search: search || undefined, pageSize: 100 },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  const rows = data?.data ?? [];

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const afterRateChange = () => {
    bump();
    onChanged();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Oylik sozlamalari</SheetTitle>
          <SheetDescription>
            Ustoz va xodim stavkalari, hisoblash davri. Jadval shu sozlamalar
            asosida hisoblanadi.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Cycle day */}
          {period && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Hisoblash davri</h3>
              <SalaryPeriodControl
                period={period}
                isCeo
                onChanged={onChanged}
              />
            </section>
          )}

          {/* Rates — one search box over both payrolls, because "who is still
              missing a rate?" is a single question and answering it should not
              depend on which list the person happens to be in. */}
          <section className="space-y-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Ism yoki ID bo'yicha..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Ustoz stavkalari</h3>
                {selected.size > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" onClick={() => setBulkType("percent")}>
                      Foiz qo&apos;yish
                    </Button>
                    <Button size="sm" onClick={() => setBulkType("monthly")}>
                      Oylik qo&apos;yish
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => setSelected(new Set())}
                      aria-label="Tanlovni tozalash"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="divide-y rounded-md border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="p-3">
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ))
                ) : rows.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    O&apos;qituvchi topilmadi.
                  </p>
                ) : (
                  rows.map((row) => (
                    <div
                      key={row.user.id}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <Checkbox
                        checked={selected.has(row.user.id)}
                        onCheckedChange={() => toggle(row.user.id)}
                        aria-label={`${row.user.firstName} ${row.user.lastName}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {row.user.firstName} {row.user.lastName}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {row.configs.length === 0 ? (
                            <Badge
                              variant="outline"
                              className="border-amber-300 text-xs font-normal text-amber-700 dark:text-amber-400"
                            >
                              Belgilanmagan
                            </Badge>
                          ) : (
                            row.configs.slice(0, 3).map((c) => (
                              <Badge
                                key={c.id}
                                variant={c.groupId ? "default" : "secondary"}
                                className="text-xs font-normal"
                              >
                                {c.groupId
                                  ? `${c.group?.name}: `
                                  : `${SALARY_TYPE_SHORT[c.salaryType] ?? c.salaryType}: `}
                                {c.salaryType === "PERCENTAGE"
                                  ? `${c.value}%`
                                  : `${formatPrice(c.value)} so'm`}
                              </Badge>
                            ))
                          )}
                          {row.configs.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{row.configs.length - 3}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        onClick={() =>
                          setEditing(toEditTarget(row.user, [TEACHER_ROLE]))
                        }
                        aria-label="Stavkani tahrirlash"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Non-teaching payroll. Separate from the list above because a
                fixed-monthly employee has no groups, no lessons and no
                accruals — the two lists answer the same question about people
                the system pays in entirely different ways. */}
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Xodimlar stavkalari</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Administrator, kassir, filial direktori — oyligi darsga
                  bog&apos;liq emas, qattiq summa. Stavka belgilangandan keyin
                  xodim jadvaldagi &laquo;Xodimlar oyligi&raquo; bo&apos;limida
                  chiqadi.
                </p>
              </div>
              <SalaryStaffConfigList
                search={search}
                refreshKey={refreshKey}
                enabled={open}
                onEdit={(row) =>
                  setEditing(toEditTarget(row.user, row.user.roles))
                }
              />
            </div>
          </section>
        </div>

        {/* Per-person rate editor — the same sheet for both lists. It offers
            PERCENTAGE / FIXED_PER_STUDENT only when the target is role 4, so a
            staff member gets the flat-monthly form and nothing else. */}
        <SalaryConfigRowSheet
          userId={editing?.id ?? null}
          employee={editing}
          onClose={() => setEditing(null)}
          onSaved={afterRateChange}
        />

        {/* Bulk rate apply */}
        <SalaryConfigBulkDialog
          kind={bulkType}
          userIds={Array.from(selected)}
          onClose={() => setBulkType(null)}
          onSaved={() => {
            setBulkType(null);
            setSelected(new Set());
            afterRateChange();
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
