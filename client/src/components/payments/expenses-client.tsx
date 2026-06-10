"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { TablePagination } from "@/components/outreach/table-pagination";
import {
  ExpensesFilterBar,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_METHOD_LABELS,
} from "./expenses-filter-bar";
import {
  ExpensesSummaryCards,
  type ExpensesSummary,
} from "./expenses-summary-cards";
import { ExpenseFormDialog, type Expense } from "./expense-form-dialog";

interface ExpensesResponse {
  data: Expense[];
  total: number;
  page: number;
  pageSize: number;
  summary: ExpensesSummary;
}

const filtersSchema = {
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 10 },
  category: { type: "string", defaultValue: "all" },
  paymentMethod: { type: "string", defaultValue: "all" },
  search: { type: "string", defaultValue: "" },
  startDate: { type: "string", defaultValue: "" },
  endDate: { type: "string", defaultValue: "" },
} as const;

export function ExpensesClient() {
  const queryClient = useQueryClient();
  const { selectedBranch } = useBranchSwitcher();
  const { filters, setFilter, setFilters, resetFilters } =
    useUrlFilters(filtersSchema);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Local search mirror so typing stays smooth; debounced into the URL.
  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => setSearchInput(filters.search), [filters.search]);
  useEffect(() => {
    if (searchInput === filters.search) return;
    const t = setTimeout(
      () => setFilters({ search: searchInput, page: 1 }),
      300,
    );
    return () => clearTimeout(t);
  }, [searchInput, filters.search, setFilters]);

  const queryParams = {
    branchId: selectedBranch?.id,
    page: filters.page,
    pageSize: filters.pageSize,
    category: filters.category === "all" ? undefined : filters.category,
    paymentMethod:
      filters.paymentMethod === "all" ? undefined : filters.paymentMethod,
    search: filters.search || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: [
      "expenses",
      "list",
      selectedBranch?.id,
      filters.page,
      filters.pageSize,
      filters.category,
      filters.paymentMethod,
      filters.search,
      filters.startDate,
      filters.endDate,
    ],
    queryFn: () =>
      api
        .get<ExpensesResponse>("/expenses", { params: queryParams })
        .then((r) => r.data),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["financial-overview"] });
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/expenses/${confirmDelete.id}`);
      toast.success("Xarajat o'chirildi");
      setConfirmDelete(null);
      refresh();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await api
        .get<Expense[]>("/expenses/export", { params: queryParams })
        .then((r) => r.data);
      downloadCsv(rows);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Eksport qilishda xatolik"));
    } finally {
      setExporting(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setDialogOpen(true);
  };

  const startDate = filters.startDate ? new Date(filters.startDate) : null;
  const endDate = filters.endDate ? new Date(filters.endDate) : null;

  const hasActiveFilters =
    filters.category !== "all" ||
    filters.paymentMethod !== "all" ||
    filters.search !== "" ||
    filters.startDate !== "" ||
    filters.endDate !== "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Xarajatlar
          </h2>
          <p className="text-sm text-muted-foreground">Markaz xarajatlari</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting || !data?.total}
          >
            {exporting ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Download className="size-4 mr-2" />
            )}
            CSV
          </Button>
          <Button onClick={openCreate}>
            <Plus className="size-4 mr-2" />
            Xarajat qo&apos;shish
          </Button>
        </div>
      </div>

      <ExpensesSummaryCards summary={data?.summary} />

      <ExpensesFilterBar
        category={filters.category}
        paymentMethod={filters.paymentMethod}
        searchValue={searchInput}
        startDate={startDate}
        endDate={endDate}
        hasActiveFilters={hasActiveFilters}
        onCategoryChange={(v) => setFilters({ category: v, page: 1 })}
        onPaymentMethodChange={(v) => setFilters({ paymentMethod: v, page: 1 })}
        onSearchChange={setSearchInput}
        onStartDateChange={(d) =>
          setFilters({ startDate: d ? format(d, "yyyy-MM-dd") : "", page: 1 })
        }
        onEndDateChange={(d) =>
          setFilters({ endDate: d ? format(d, "yyyy-MM-dd") : "", page: 1 })
        }
        onReset={() => {
          setSearchInput("");
          resetFilters();
        }}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {hasActiveFilters
            ? "Tanlangan filtrlar bo'yicha xarajat topilmadi — filtrlarni o'zgartirib ko'ring"
            : "Hali xarajat qayd qilinmagan"}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>Kategoriya</TableHead>
                <TableHead>Tavsif</TableHead>
                <TableHead>Summa</TableHead>
                <TableHead>To&apos;lov turi</TableHead>
                <TableHead>Sana</TableHead>
                <TableHead>Kim kiritgan</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((e, i) => (
                <TableRow key={e.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {(filters.page - 1) * filters.pageSize + i + 1}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{e.description}</TableCell>
                  <TableCell className="text-red-600 font-medium">
                    -{formatPrice(e.amount)} so&apos;m
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {EXPENSE_METHOD_LABELS[e.paymentMethod] ??
                        e.paymentMethod}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(e.date), "dd.MM.yyyy")}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span>
                      {e.createdBy.firstName} {e.createdBy.lastName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {format(new Date(e.createdAt), "dd.MM.yyyy, HH:mm")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                        >
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Amallar</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(e)}>
                          <Pencil className="mr-2 size-4" />
                          Tahrirlash
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setConfirmDelete(e)}
                        >
                          <Trash2 className="mr-2 size-4" />
                          O&apos;chirish
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TablePagination
            total={data.total}
            page={filters.page}
            pageSize={filters.pageSize}
            onPageChange={(p) => setFilter("page", p)}
            onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })}
          />
        </>
      )}

      <ExpenseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        expense={editing}
        branchId={selectedBranch?.id}
        onSaved={refresh}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(v) => {
          if (!v && !deleting) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xarajatni o&apos;chirasizmi?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu xarajat o&apos;chiriladi va unga bog&apos;liq moliyaviy yozuv
              (ledger) teskari yoziladi. Bu amalni qaytarib bo&apos;lmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              Bekor qilish
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin mr-2" />}
              O&apos;chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Build a UTF-8-with-BOM CSV (Excel-friendly) of the filtered expenses and
// trigger a browser download. Mirrors the salary-breakdown-drawer export.
function downloadCsv(rows: Expense[]) {
  const headers = [
    "Sana",
    "Kategoriya",
    "Tavsif",
    "Summa",
    "To'lov turi",
    "Kim kiritgan",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((e) =>
    [
      format(new Date(e.date), "dd.MM.yyyy"),
      EXPENSE_CATEGORY_LABELS[e.category] ?? e.category,
      e.description,
      String(e.amount),
      EXPENSE_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod,
      `${e.createdBy.firstName} ${e.createdBy.lastName}`,
    ]
      .map((c) => esc(String(c)))
      .join(","),
  );
  const csv = "﻿" + [headers.map(esc).join(","), ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `xarajatlar-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
