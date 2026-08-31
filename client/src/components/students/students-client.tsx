"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Plus } from "lucide-react";
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
import { StudentsStats, type StudentsStatsData } from "./students-stats";
import { StudentsTable } from "./students-table";
import { EditStudentDrawer } from "./edit-student-drawer";
import { AddStudentDialog } from "./add-student-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { listParam, useUrlFilters } from "@/hooks/use-url-filters";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import api from "@/lib/api";
import {
  buildBotLink,
  isTelegramBotConfigured,
  TELEGRAM_BOT_NOT_CONFIGURED,
} from "@/lib/telegram-link";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

const filtersSchema = {
  search: { type: "string" as const, defaultValue: "" },
  status: { type: "array" as const, defaultValue: [] as string[] },
  teacherId: { type: "array" as const, defaultValue: [] as string[] },
  groupId: { type: "array" as const, defaultValue: [] as string[] },
  level: { type: "array" as const, defaultValue: [] as string[] },
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 10 },
};

export function StudentsClient() {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<StudentsStatsData>({ total: 0, active: 0, frozen: 0, debtors: 0 });
  const [levelCounts, setLevelCounts] = useState<Record<string, number>>({});
  const { filters, setFilter, setFilters: setUrlFilters, resetFilters } = useUrlFilters(filtersSchema);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [loading, setLoading] = useState(true);
  const [teacherGroups, setTeacherGroups] = useState<{ id: string; name: string }[]>([]);
  const [copied, setCopied] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const canManage = user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;
  const isTeacher = user?.roles.every((r) => r.id === 4) ?? false;
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setUrlFilters({ search: value, page: 1 });
  }, 300);

  const handleCopyLink = async () => {
    if (!selectedBranch) return;
    const link = buildBotLink(`student_${selectedBranch.id}`);
    if (!link) {
      toast.error(TELEGRAM_BOT_NOT_CONFIGURED);
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Havola nusxalandi");
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page: filters.page,
        pageSize: filters.pageSize,
      };
      const searchValue = filters.search.trim();
      const cleanSearch = searchValue.startsWith('#') ? searchValue.slice(1).trim() : searchValue;
      if (cleanSearch) params.search = cleanSearch;
      params.status = listParam(filters.status);
      params.teacher_id = listParam(filters.teacherId);
      params.group_id = listParam(filters.groupId);
      params.level = listParam(filters.level);
      if (selectedBranch?.id) params.branch_id = selectedBranch.id;
      const { data } = await api.get("/students", { params });
      setStudents(data.data);
      setTotal(data.total);
      setStats(data.stats ?? { total: 0, active: 0, frozen: 0, debtors: 0 });
      setLevelCounts(data.levelCounts ?? {});
    } catch {
      // xatolik
    } finally {
      setLoading(false);
    }
  }, [filters.page, filters.pageSize, filters.search, filters.status, filters.teacherId, filters.groupId, filters.level, selectedBranch?.id]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    if (!isTeacher) return;
    const fetchTeacherGroups = async () => {
      try {
        const { data } = await api.get("/groups", { params: { pageSize: 100 } });
        setTeacherGroups((data.data ?? []).map((g: any) => ({ id: g.id, name: g.name })));
      } catch {
        // xatolik
      }
    };
    fetchTeacherGroups();
  }, [isTeacher]);

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  const handleFilterChange = (newFilters: StudentFilters) => {
    if (newFilters.fullName !== searchInput) {
      setSearchInput(newFilters.fullName);
      debouncedSetSearch(newFilters.fullName);
    }
    const sameList = (a: string[], b: string[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    if (
      !sameList(newFilters.status, filters.status) ||
      !sameList(newFilters.teacherId, filters.teacherId) ||
      !sameList(newFilters.groupId, filters.groupId) ||
      !sameList(newFilters.level, filters.level)
    ) {
      setUrlFilters({
        status: newFilters.status,
        teacherId: newFilters.teacherId,
        groupId: newFilters.groupId,
        level: newFilters.level,
        page: 1,
      });
    }
  };

  const handlePageSizeChange = (value: string) => {
    setUrlFilters({ pageSize: Number(value), page: 1 });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
            O&apos;quvchilar
          </h1>
          <p className="text-muted-foreground">
            {isTeacher ? "Sizning guruhlaringizdagi o\u2018quvchilar" : "Barcha o\u2018quvchilar ro\u2018yxati"}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {selectedBranch ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => setAddOpen(true)} className="shrink-0">
                    <Plus className="mr-2 size-4" />
                    Yangi o&apos;quvchi
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Qo&apos;lda yangi o&apos;quvchi qo&apos;shish (Telegramsiz)
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button disabled className="shrink-0">
                      <Plus className="mr-2 size-4" />
                      Yangi o&apos;quvchi
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Avval filial tanlang</TooltipContent>
              </Tooltip>
            )}
            {selectedBranch && isTelegramBotConfigured ? (
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
                  {selectedBranch ? TELEGRAM_BOT_NOT_CONFIGURED : "Avval filial tanlang"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      <StudentsStats
        stats={filters.status.length > 0 ? { ...stats, total } : stats}
        loading={loading}
        isTeacher={isTeacher}
      />
      <StudentsFilters
        filters={{ fullName: searchInput, status: filters.status, teacherId: filters.teacherId, groupId: filters.groupId, level: filters.level }}
        onFilterChange={handleFilterChange}
        onClear={() => { setSearchInput(""); resetFilters(); }}
        isTeacher={isTeacher}
        groups={teacherGroups}
        levelCounts={levelCounts}
      />
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
              <Skeleton className="hidden h-4 w-16 md:block" />
              <Skeleton className="ml-auto h-4 w-20" />
              <Skeleton className="hidden h-4 w-14 sm:block" />
              <Skeleton className="h-4 w-8" />
            </div>
            {/* Row skeletons */}
            {Array.from({ length: filters.pageSize > 5 ? 5 : filters.pageSize }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b px-4 py-3">
                <Skeleton className="h-4 w-8" />
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="hidden h-4 w-28 sm:block" />
                <Skeleton className="hidden h-4 w-16 md:block" />
                <Skeleton className="hidden h-4 w-16 md:block" />
                <Skeleton className="ml-auto h-4 w-20" />
                <Skeleton className="hidden h-4 w-14 sm:block" />
                <Skeleton className="h-4 w-8" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <StudentsTable
          students={students}
          page={filters.page}
          pageSize={filters.pageSize}
          onDeleted={(id) => {
            setStudents((prev) => prev.filter((s) => s.id !== id));
            setTotal((prev) => Math.max(0, prev - 1));
          }}
          onStatusChanged={() => {
            fetchStudents();
          }}
        />
      )}
      {totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Sahifada:</span>
            <Select value={String(filters.pageSize)} onValueChange={handlePageSizeChange}>
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
              disabled={filters.page <= 1}
              onClick={() => setFilter("page", filters.page - 1)}
            >
              <ChevronLeft className="mr-1 size-4" />
              Oldingi
            </Button>
            <span className="text-sm">
              {filters.page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => setFilter("page", filters.page + 1)}
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
      <AddStudentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => fetchStudents()}
      />
    </div>
  );
}
