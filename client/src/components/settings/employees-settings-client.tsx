"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { SettingsPageHeader } from "./settings-page-header";
import { EmployeeRowActions } from "./employee-row-actions";
import { EditEmployeeDrawer } from "./edit-employee-drawer";
import { useEditEmployee, type EmployeeUser } from "@/hooks/use-edit-employee";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";
import toast from "react-hot-toast";

const ROLE_LABELS: Record<string, string> = {
  CEO: "CEO",
  "Branch Director": "Direktor",
  Administrator: "Administrator",
  Teacher: "O'qituvchi",
  Cashier: "Kassir",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  CEO: "default",
  "Branch Director": "secondary",
  Administrator: "outline",
  Teacher: "outline",
  Cashier: "outline",
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 9) {
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
  }
  return phone;
}

function getEmployeeProfileUrl(emp: EmployeeUser): string {
  return `/settings/employees/${emp.id}`;
}

export function EmployeesSettingsClient() {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const openAddDrawer = useEditEmployee((s) => s.openAddDrawer);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);

  const fetchEmployees = useCallback(async () => {
    if (!branchLoaded || !selectedBranch) return;
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        per_page: pageSize,
        branch_id: selectedBranch.id,
      };
      if (search.trim()) params.search = search.trim();
      if (roleFilter !== "all") params.user_type = roleFilter;
      const { data } = await api.get("/users", { params });
      setEmployees(data.data);
      setTotal(data.total);
    } catch {
      setEmployees([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, roleFilter, selectedBranch?.id, branchLoaded]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleSaved = (saved: EmployeeUser) => {
    setEmployees((prev) => {
      const exists = prev.find((e) => e.id === saved.id);
      if (exists) return prev.map((e) => (e.id === saved.id ? saved : e));
      return [saved, ...prev];
    });
    setTotal((t) => t + (employees.some((e) => e.id === saved.id) ? 0 : 1));
  };

  const handleDeleted = async (id: number) => {
    try {
      await api.delete(`/users/${id}`);
      setEmployees((prev) => prev.filter((e) => e.id !== id));
      setTotal((t) => t - 1);
      toast.success("Xodim o'chirildi");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "O'chirishda xatolik");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Xodimlar"
        description="Tizim xodimlarini boshqarish va rollarni belgilash"
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={openAddDrawer}>
                <Plus className="mr-1.5 h-4 w-4" />
                Yangi xodim
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yangi xodim qo&apos;shish</TooltipContent>
          </Tooltip>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative w-full sm:w-auto">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Ism bo'yicha qidirish..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 sm:w-64"
          />
        </div>

        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha lavozimlar</SelectItem>
            <SelectItem value="CEO">CEO</SelectItem>
            <SelectItem value="Branch Director">Direktor</SelectItem>
            <SelectItem value="Administrator">Administrator</SelectItem>
            <SelectItem value="Teacher">O&apos;qituvchi</SelectItem>
            <SelectItem value="Cashier">Kassir</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Ism familiya</TableHead>
              <TableHead>Lavozimi</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Holati</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="border-r"><Skeleton className="h-4 w-6" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="size-6 rounded" /></TableCell>
                </TableRow>
              ))
            ) : employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-8 w-8 text-muted-foreground/50" />
                    Xodimlar topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              employees.map((emp, index) => (
                <TableRow
                  key={emp.id}
                  className="cursor-pointer"
                  onClick={() => router.push(getEmployeeProfileUrl(emp))}
                >
                  <TableCell className="border-r text-muted-foreground">
                    {(page - 1) * pageSize + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">{emp.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {emp.roles.map((r) => (
                        <Badge key={r.id} variant={ROLE_VARIANTS[r.name] || "outline"}>
                          {ROLE_LABELS[r.name] || r.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{formatPhone(emp.phone)}</TableCell>
                  <TableCell>
                    {emp.branches.length > 0
                      ? emp.branches.map((b) => b.name).join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={emp.status === "ACTIVE" ? "default" : "secondary"}>
                      {emp.status === "ACTIVE" ? "Faol" : "Nofaol"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <EmployeeRowActions employee={emp} onDelete={handleDeleted} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 0 && !loading && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Jami: {total}</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="size-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="size-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <EditEmployeeDrawer onSaved={handleSaved} />
    </div>
  );
}
