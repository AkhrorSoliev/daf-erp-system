"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search, Send, Users } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SettingsPageHeader } from "./settings-page-header";
import { EmployeeRowActions } from "./employee-row-actions";
import { EditEmployeeDrawer } from "./edit-employee-drawer";
import { TelegramLinkDialog } from "./telegram-link-dialog";
import { useEditEmployee, type EmployeeUser } from "@/hooks/use-edit-employee";
import { positionLabel } from "@/components/payments/salary-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useIsMobile } from "@/hooks/use-mobile";
import { listParam, useUrlFilters } from "@/hooks/use-url-filters";
import {
  MultiSelectCombobox,
  type MultiSelectOption,
} from "@/components/ui/multi-select-combobox";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import api from "@/lib/api";
import { formatPhone } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { roleTitle } from "@/components/profile/profile-roles";
import { useT } from "@/i18n/context";
import toast from "react-hot-toast";

/** Role NAME (the `user_type` filter value) → id, for the role's title. */
const ROLE_IDS: Record<string, number> = {
  CEO: 1,
  "Branch Director": 2,
  Administrator: 3,
  Teacher: 4,
  Cashier: 5,
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  CEO: "default",
  "Branch Director": "secondary",
  Administrator: "outline",
  Teacher: "outline",
  Cashier: "outline",
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

/**
 * Bu filtr ROL bo'yicha qidiradi, lavozim bo'yicha emas — jadvaldagi ustun esa
 * lavozimni ko'rsatadi (`positionLabel`, lavozimi yo'qlar uchun rol nomiga
 * qaytadi). Ilgari u «Barcha lavozimlar» deb atalardi va shu ikkovini
 * chalkashtirardi.
 *
 * `__roleless` rol nomi emas, belgi: rolsiz xodim (farrosh, qorovul) ataylab
 * mavjud va rol nomlari ro'yxatidagi hech qaysi variantga tushmaydi, ya'ni usiz
 * uni filtr orqali topib bo'lmasdi.
 */
const ROLELESS_TOKEN = "__roleless";

const filtersSchema = {
  search: { type: "string" as const, defaultValue: "" },
  // Bir nechta rol tanlanadi; bo'sh ro'yxat = «Barcha lavozimlar».
  role: { type: "array" as const, defaultValue: [] as string[] },
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 10 },
};

function getEmployeeProfileUrl(emp: EmployeeUser): string {
  return `/settings/employees/${emp.id}`;
}

export function EmployeesSettingsClient() {
  const t = useT();
  const [employees, setEmployees] = useState<EmployeeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<EmployeeUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { filters, setFilter, setFilters: setUrlFilters } = useUrlFilters(filtersSchema);
  const [searchInput, setSearchInput] = useState(filters.search);

  const isMobile = useIsMobile();
  const openAddDrawer = useEditEmployee((s) => s.openAddDrawer);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setUrlFilters({ search: value, page: 1 });
  }, 300);

  const fetchEmployees = useCallback(async () => {
    if (!branchLoaded) return;
    setLoading(true);
    try {
      // «Barcha filiallar» (selectedBranch null) — branch_id yuborilmaydi
      const params: Record<string, any> = {
        page: filters.page,
        pageSize: filters.pageSize,
      };
      if (selectedBranch) params.branch_id = selectedBranch.id;
      if (filters.search.trim()) params.search = filters.search.trim();
      // Server `user_type` ni vergulli ro'yxat sifatida qabul qiladi.
      params.user_type = listParam(filters.role);
      const { data } = await api.get("/users", { params });
      setEmployees(data.data);
      setTotal(data.total);
    } catch {
      setEmployees([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters.page, filters.pageSize, filters.search, filters.role, selectedBranch?.id, branchLoaded]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleSaved = (saved: EmployeeUser) => {
    setEmployees((prev) => {
      const exists = prev.find((e) => e.id === saved.id);
      if (exists) return prev.map((e) => (e.id === saved.id ? saved : e));
      return [saved, ...prev];
    });
    setTotal((n) => n + (employees.some((e) => e.id === saved.id) ? 0 : 1));
  };

  const performDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/users/${confirmDelete.id}`);
      setEmployees((prev) => prev.filter((e) => e.id !== confirmDelete.id));
      setTotal((n) => n - 1);
      toast.success(t("Xodim arxivga o'tkazildi"));
      setConfirmDelete(null);
    } catch (err) {
      toast.error(getErrorMessage(err, t("O'chirishda xatolik")));
    } finally {
      setDeleting(false);
    }
  };

  const roleFilterOptions: MultiSelectOption[] = [
    ...Object.entries(ROLE_IDS).map(([value, id]) => ({ value, label: roleTitle({ id }, t) })),
    { value: ROLELESS_TOKEN, label: t("Rolsiz") },
  ];

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  const handlePageSizeChange = (value: string) => {
    setUrlFilters({ pageSize: Number(value), page: 1 });
  };

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title={t("Xodimlar")}
        description={t("Tizim xodimlarini boshqarish va rollarni belgilash")}
        action={
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={selectedBranch ? -1 : 0}>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selectedBranch}
                    onClick={() => setTelegramDialogOpen(true)}
                  >
                    <Send className="mr-1.5 h-4 w-4" />
                    {t("Telegram havola")}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {selectedBranch
                  ? t("Telegram orqali ro'yxatdan o'tish havolasi")
                  : t("Avval filial tanlang")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" data-tour="employee-add" onClick={openAddDrawer}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t("Yangi xodim")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("Yangi xodim qo'shish")}</TooltipContent>
            </Tooltip>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative w-full sm:w-auto">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder={t("Ism bo'yicha qidirish...")}
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); debouncedSetSearch(e.target.value); }}
            className="w-full pl-9 sm:w-64"
          />
        </div>

        <MultiSelectCombobox
          options={roleFilterOptions}
          selected={filters.role}
          onChange={(next) => setUrlFilters({ role: next, page: 1 })}
          placeholder={t("Barcha rollar")}
          searchPlaceholder={t("Rol qidirish...")}
          className="w-full sm:w-44"
        />
      </div>

      {/* Mobile: card list */}
      {isMobile ? (
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </div>
            ))
          ) : employees.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Users className="size-8 text-muted-foreground/50" />
              {t("Xodimlar topilmadi")}
            </div>
          ) : (
            employees.map((emp) => {
              const fullName = `${emp.firstName} ${emp.lastName}`;
              const initials = `${emp.firstName[0] ?? ""}${emp.lastName[0] ?? ""}`.toUpperCase();
              return (
                <Link
                  key={emp.id}
                  href={getEmployeeProfileUrl(emp)}
                  className="block rounded-lg border bg-card p-3 active:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10 shrink-0">
                      {emp.photo && <AvatarImage src={emp.photo} alt={fullName} />}
                      <AvatarFallback className="text-xs font-medium">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{fullName}</p>
                        <Badge
                          variant={emp.status === "ACTIVE" ? "default" : "secondary"}
                          className="text-[10px] px-1.5 py-0 shrink-0"
                        >
                          {emp.status === "ACTIVE" ? t("Faol") : t("Nofaol")}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {positionLabel(emp, t)}
                        </span>
                      </div>
                      {emp.phone && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatPhone(emp.phone)}
                        </p>
                      )}
                    </div>
                    <EmployeeRowActions employee={emp} onDeleteRequest={setConfirmDelete} />
                  </div>
                </Link>
              );
            })
          )}
        </div>
      ) : (
        /* Desktop: table */
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>{t("Ism familiya")}</TableHead>
                <TableHead>{t("Lavozimi")}</TableHead>
                <TableHead>{t("Telefon")}</TableHead>
                <TableHead>{t("Filial")}</TableHead>
                <TableHead>{t("Holati")}</TableHead>
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
                      {t("Xodimlar topilmadi")}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((emp, index) => (
                  <TableRow
                    key={emp.id}
                    className="relative cursor-pointer"
                  >
                    <TableCell className="border-r text-muted-foreground">
                      {(filters.page - 1) * filters.pageSize + index + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={getEmployeeProfileUrl(emp)} className="absolute inset-0" />
                      {emp.firstName} {emp.lastName}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-medium">{positionLabel(emp, t)}</span>
                        {emp.roles.map((r) => (
                          <Badge
                            key={r.id}
                            variant={ROLE_VARIANTS[r.name] || "outline"}
                            className="text-[10px] font-normal"
                          >
                            {roleTitle(r, t)}
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
                        {emp.status === "ACTIVE" ? t("Faol") : t("Nofaol")}
                      </Badge>
                    </TableCell>
                    <TableCell className="relative z-10">
                      <EmployeeRowActions employee={emp} onDeleteRequest={setConfirmDelete} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 0 && !loading && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t("Jami: {n}", { n: total })}</span>
            <Select value={String(filters.pageSize)} onValueChange={handlePageSizeChange}>
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
            <Button variant="outline" size="icon" className="size-8" disabled={filters.page <= 1} onClick={() => setFilter("page", filters.page - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{filters.page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="size-8" disabled={filters.page >= totalPages} onClick={() => setFilter("page", filters.page + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <EditEmployeeDrawer onSaved={handleSaved} />
      <TelegramLinkDialog
        open={telegramDialogOpen}
        onOpenChange={setTelegramDialogOpen}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && !deleting && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Xodimni o'chirishni tasdiqlaysizmi?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? t("{name} arxivga o'tkaziladi. Uning hisobi nofaol bo'ladi, lekin tarixiy ma'lumotlar saqlanadi.", {
                    name: `${confirmDelete.firstName} ${confirmDelete.lastName}`,
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("Bekor qilish")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void performDelete();
              }}
              disabled={deleting}
              variant="destructive"
            >
              {deleting ? t("O'chirilmoqda...") : t("O'chirish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
