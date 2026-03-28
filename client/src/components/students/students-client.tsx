"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";
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
  id: "",
  status: "all",
  groupLevel: "all",
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
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);

  const handleCopyLink = async () => {
    if (!selectedBranch) return;
    const link = `https://t.me/dafzentrum_bot?start=student_${selectedBranch.id}`;
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
      const { data } = await api.get("/students", { params });
      setStudents(data.data);
      setTotal(data.total);
    } catch {
      // xatolik
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters.fullName, filters.status]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const filteredStudents = useMemo(() => {
    let result = students;

    if (filters.id) {
      result = result.filter((s) => String(s.id).includes(filters.id));
    }

    if (filters.groupLevel && filters.groupLevel !== "all") {
      result = result.filter((s) =>
        s.groups.some((g) => g.level === filters.groupLevel)
      );
    }

    return result;
  }, [students, filters.id, filters.groupLevel]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleFilterChange = (newFilters: StudentFilters) => {
    const searchChanged = newFilters.fullName !== filters.fullName;
    const statusChanged = newFilters.status !== filters.status;
    setFilters(newFilters);
    if (searchChanged || statusChanged) {
      setPage(1);
    }
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <StudentsStats students={students} />
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
      <StudentsFilters filters={filters} onFilterChange={handleFilterChange} />
      {loading ? (
        <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border">
          Yuklanmoqda...
        </div>
      ) : (
        <StudentsTable students={filteredStudents} />
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
