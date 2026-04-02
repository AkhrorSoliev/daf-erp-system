"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import toast from "react-hot-toast";
import type { Student } from "@/data/student-model";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StudentsFilters,
  type StudentFilters,
} from "./students-filters";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StudentsStats } from "./students-stats";
import { StudentsTable } from "./students-table";
import { EditStudentDrawer } from "./edit-student-drawer";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

const defaultFilters: StudentFilters = {
  fullName: "",
  status: "all",
};

export function StudentsClient() {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<StudentFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const user = useAuth((s) => s.user);
  const canManage = user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;
  const isTeacher = user?.roles.every((r) => r.id === 4) ?? false;
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);

  const handleCopyLink = async () => {
    if (!selectedBranch) return;
    const link = `https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT}?start=student_${selectedBranch.id}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Havola nusxalandi");
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        per_page: pageSize,
      };
      if (filters.fullName.trim()) params.search = filters.fullName.trim();
      if (filters.status && filters.status !== "all") params.status = filters.status;
      if (selectedBranch?.id) params.branch_id = selectedBranch.id;
      const { data } = await api.get("/students", { params });
      setStudents(data.data);
      setTotal(data.total);
    } catch {
      // xatolik
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters.fullName, filters.status, selectedBranch?.id]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleFilterChange = (newFilters: StudentFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <StudentsStats students={students} loading={loading} isTeacher={isTeacher} />
        {canManage && (
          selectedBranch ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={handleCopyLink} className="shrink-0">
                  {copied ? (
                    <Check className="mr-2 size-4 text-green-500" />
                  ) : (
                    <Copy className="mr-2 size-4" />
                  )}
                  {copied ? "Nusxalandi" : "Havola olish"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Telegram orqali ro&apos;yxatdan o&apos;tish havolasini nusxalash
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button variant="outline" disabled className="shrink-0">
                    <Copy className="mr-2 size-4" />
                    Havola olish
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Avval filial tanlang
              </TooltipContent>
            </Tooltip>
          )
        )}
      </div>
      <StudentsFilters filters={filters} onFilterChange={handleFilterChange} isTeacher={isTeacher} />
      {loading ? (
        <div className="overflow-x-auto rounded-md border">
          <div className="space-y-0">
            {/* Header skeleton */}
            <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="hidden h-4 w-28 sm:block" />
              <Skeleton className="hidden h-4 w-16 md:block" />
              <Skeleton className="ml-auto h-4 w-20" />
              <Skeleton className="hidden h-4 w-14 sm:block" />
              <Skeleton className="h-4 w-8" />
            </div>
            {/* Row skeletons */}
            {Array.from({ length: pageSize > 5 ? 5 : pageSize }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b px-4 py-3">
                <Skeleton className="h-4 w-8" />
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="hidden h-4 w-28 sm:block" />
                <Skeleton className="hidden h-4 w-16 md:block" />
                <Skeleton className="ml-auto h-4 w-20" />
                <Skeleton className="hidden h-4 w-14 sm:block" />
                <Skeleton className="h-4 w-8" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <StudentsTable students={students} />
      )}
      {totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Sahifada:</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-sm">
              {`Jami: ${total} ta o'quvchi`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="mr-1 size-4" />
              Oldingi
            </Button>
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Keyingi
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}
      <EditStudentDrawer
        onSaved={(updated) => {
          setStudents((prev) => {
            const exists = prev.some((s) => s.id === updated.id);
            if (exists) {
              return prev.map((s) => (s.id === updated.id ? updated : s));
            }
            fetchStudents();
            return prev;
          });
        }}
      />
    </div>
  );
}
