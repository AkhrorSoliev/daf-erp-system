"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { SalaryConfigRowSheet } from "./salary-config-row-sheet";
import { SalaryConfigBulkDialog } from "./salary-config-bulk-dialog";

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  isActive: boolean;
  branches: { id: number; name: string }[];
  roles: { id: number; name: string }[];
}

interface ActiveConfig {
  id: string;
  salaryType: string;
  value: number;
  groupId: string | null;
  group: { id: string; name: string } | null;
}

const ROLE_LABELS: Record<string, string> = {
  CEO: "Direktor",
  "Branch Director": "Filial direktori",
  Administrator: "Administrator",
  Teacher: "O'qituvchi",
  Cashier: "Kassir",
};

const SALARY_TYPE_SHORT: Record<string, string> = {
  PERCENTAGE: "Foiz",
  FIXED_PER_STUDENT: "O'quvchi boshiga",
  FIXED_MONTHLY: "Oylik",
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

const filtersSchema = {
  search: { type: "string" as const, defaultValue: "" },
  role: { type: "string" as const, defaultValue: "all" },
  status: { type: "string" as const, defaultValue: "all" }, // all|configured|unconfigured
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 20 },
};

export function SalaryConfigPageClient() {
  const user = useAuth((s) => s.user);
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;

  const { filters, setFilter, setFilters: setUrlFilters } =
    useUrlFilters(filtersSchema);
  const [searchInput, setSearchInput] = useState(filters.search);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [bulkType, setBulkType] = useState<"percent" | "monthly" | null>(null);

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setUrlFilters({ search: value, page: 1 });
  }, 300);

  // ─── Employees query ────────────────────────────────────────
  const employeesQuery = useQuery({
    queryKey: [
      "salary-config-employees",
      filters.search,
      filters.role,
      filters.page,
      filters.pageSize,
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page: filters.page,
        pageSize: filters.pageSize,
      };
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.role !== "all") params.user_type = filters.role;
      const { data } = await api.get<{ data: Employee[]; total: number }>(
        "/users",
        { params },
      );
      return data;
    },
  });

  const employees = employeesQuery.data?.data ?? [];
  const total = employeesQuery.data?.total ?? 0;

  // ─── Bulk salary configs for visible rows ───────────────────
  const userIdsKey = employees
    .map((e) => e.id)
    .sort((a, b) => a - b)
    .join(",");

  const configsQuery = useQuery({
    queryKey: ["salary-configs-by-users", userIdsKey],
    queryFn: () =>
      api
        .get<Record<number, ActiveConfig[]>>(
          `/salary/configs/by-users?userIds=${userIdsKey}`,
        )
        .then((r) => r.data),
    enabled: employees.length > 0,
  });

  const configsByUser = configsQuery.data ?? {};

  // ─── Filter by configured/unconfigured (client-side over current page) ───
  const visibleEmployees = useMemo(() => {
    if (filters.status === "all") return employees;
    return employees.filter((e) => {
      const has = (configsByUser[e.id]?.length ?? 0) > 0;
      return filters.status === "configured" ? has : !has;
    });
  }, [employees, configsByUser, filters.status]);

  // Reset selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filters.search, filters.role, filters.status, filters.page]);

  const refetchAll = useCallback(() => {
    employeesQuery.refetch();
    configsQuery.refetch();
  }, [employeesQuery, configsQuery]);

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === visibleEmployees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleEmployees.map((e) => e.id)));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  if (!isCeo) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Oylik belgilash</h1>
        <p className="text-muted-foreground">
          Bu sahifaga faqat Direktor (CEO) kira oladi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/payments/salary">
            <ArrowLeft className="size-4" />
            Orqaga
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Oylik belgilash</h1>
          <p className="text-sm text-muted-foreground">
            Xodimlar uchun foiz, oylik yoki o&apos;quvchi boshiga oylik
            qoidalarini boshqarish
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Ism, familiya yoki ID bo'yicha..."
            className="pl-9"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              debouncedSetSearch(e.target.value);
            }}
          />
        </div>
        <Select
          value={filters.role}
          onValueChange={(v) => setUrlFilters({ role: v, page: 1 })}
        >
          <SelectTrigger className="md:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha rollar</SelectItem>
            <SelectItem value="Teacher">O&apos;qituvchilar</SelectItem>
            <SelectItem value="Administrator">Administratorlar</SelectItem>
            <SelectItem value="Branch Director">Filial direktorlari</SelectItem>
            <SelectItem value="Cashier">Kassirlar</SelectItem>
            <SelectItem value="CEO">Direktorlar</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.status}
          onValueChange={(v) => setUrlFilters({ status: v, page: 1 })}
        >
          <SelectTrigger className="md:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha holat</SelectItem>
            <SelectItem value="configured">Belgilangan</SelectItem>
            <SelectItem value="unconfigured">Belgilanmagan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-accent/50 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} ta xodim tanlandi
          </span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setBulkType("percent")}>
              Foiz qo&apos;yish
            </Button>
            <Button size="sm" onClick={() => setBulkType("monthly")}>
              Oylik qo&apos;yish
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="size-4" />
              Tozalash
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={
                    visibleEmployees.length > 0 &&
                    selectedIds.size === visibleEmployees.length
                  }
                  onCheckedChange={toggleAll}
                  aria-label="Barchasini tanlash"
                />
              </TableHead>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Ism Familiya</TableHead>
              <TableHead className="w-40">Rol</TableHead>
              <TableHead className="w-44">Filial</TableHead>
              <TableHead>Joriy oylik</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employeesQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : visibleEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Xodim topilmadi
                </TableCell>
              </TableRow>
            ) : (
              visibleEmployees.map((emp, idx) => {
                const role = ROLE_LABELS[emp.roles[0]?.name ?? ""] ?? "—";
                const branch = emp.branches[0]?.name ?? "—";
                const cfgs = configsByUser[emp.id] ?? [];
                const checked = selectedIds.has(emp.id);
                return (
                  <TableRow
                    key={emp.id}
                    className={checked ? "bg-accent/40" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleOne(emp.id)}
                        aria-label={`${emp.firstName} ${emp.lastName}`}
                      />
                    </TableCell>
                    <TableCell className="border-r text-muted-foreground tabular-nums">
                      {(filters.page - 1) * filters.pageSize + idx + 1}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">#{emp.id}</div>
                    </TableCell>
                    <TableCell>{role}</TableCell>
                    <TableCell className="text-sm">{branch}</TableCell>
                    <TableCell>
                      {configsQuery.isLoading ? (
                        <Skeleton className="h-5 w-32" />
                      ) : cfgs.length === 0 ? (
                        <Badge
                          variant="outline"
                          className="text-amber-700 border-amber-300 dark:text-amber-400"
                        >
                          Belgilanmagan
                        </Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {cfgs.slice(0, 3).map((c) => (
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
                          ))}
                          {cfgs.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{cfgs.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingUserId(emp.id)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Sahifada:</span>
          <Select
            value={String(filters.pageSize)}
            onValueChange={(v) =>
              setUrlFilters({ pageSize: parseInt(v, 10), page: 1 })
            }
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>· Jami: {total}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={filters.page <= 1}
            onClick={() => setFilter("page", filters.page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm tabular-nums">
            {filters.page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={filters.page >= totalPages}
            onClick={() => setFilter("page", filters.page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Per-employee Sheet */}
      <SalaryConfigRowSheet
        userId={editingUserId}
        employee={
          editingUserId
            ? employees.find((e) => e.id === editingUserId) ?? null
            : null
        }
        onClose={() => setEditingUserId(null)}
        onSaved={refetchAll}
      />

      {/* Bulk apply Dialog */}
      <SalaryConfigBulkDialog
        kind={bulkType}
        userIds={Array.from(selectedIds)}
        onClose={() => setBulkType(null)}
        onSaved={() => {
          setBulkType(null);
          setSelectedIds(new Set());
          refetchAll();
        }}
      />
    </div>
  );
}
