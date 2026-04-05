"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GroupsTable } from "./groups-table";
import { EditGroupDrawer } from "./edit-group-drawer";
import { useEditGroup, type GroupData } from "@/hooks/use-edit-group";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

export function GroupsClient() {
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const { openAddDrawer } = useEditGroup();
  const user = useAuth((s) => s.user);
  const canManage = user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;
  const isTeacherOnly =
    (user?.roles.some((r) => r.id === 4) && !canManage) ?? false;
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);

  const fetchGroups = useCallback(async () => {
    if (!isTeacherOnly && (!branchLoaded || !selectedBranch)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        pageSize,
      };
      if (selectedBranch) params.branch_id = selectedBranch.id;
      if (statusFilter !== "all") params.status = Number(statusFilter);
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get("/groups", { params });
      setGroups(data.data);
      setTotal(data.total);
    } catch {
      // xatolik
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    search,
    statusFilter,
    selectedBranch,
    branchLoaded,
    isTeacherOnly,
  ]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Nomi bo'yicha qidirish..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[calc(100%-3rem)] sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha holatlar</SelectItem>
            <SelectItem value="1">Faol</SelectItem>
            <SelectItem value="2">Boshlanmagan</SelectItem>
            <SelectItem value="3">Pauza</SelectItem>
            <SelectItem value="4">To&apos;xtatilgan</SelectItem>
          </SelectContent>
        </Select>
        {canManage &&
          (selectedBranch ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={openAddDrawer}
                  className="size-9 sm:size-auto sm:h-9 sm:px-4 shrink-0"
                >
                  <Plus className="size-4 sm:mr-2" />
                  <span className="hidden sm:inline">Yangi guruh</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">Yangi guruh</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button
                    disabled
                    size="icon"
                    className="sm:size-auto sm:px-4 shrink-0"
                  >
                    <Plus className="size-4 sm:mr-2" />
                    <span className="hidden sm:inline">Yangi guruh</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Avval filialni tanlang</TooltipContent>
            </Tooltip>
          ))}
      </div>

      {loading ? (
        <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border">
          Yuklanmoqda...
        </div>
      ) : (
        <GroupsTable
          groups={groups}
          page={page}
          pageSize={pageSize}
          onDeleted={(id) => {
            setGroups((prev) => prev.filter((g) => g.id !== id));
            setTotal((prev) => Math.max(0, prev - 1));
          }}
        />
      )}

      {totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Sahifada:</span>
            <Select
              value={String(pageSize)}
              onValueChange={handlePageSizeChange}
            >
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
              Jami: {total} ta guruh
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

      <EditGroupDrawer
        onSaved={(updated) => {
          setGroups((prev) => {
            const exists = prev.some((g) => g.id === updated.id);
            if (exists) {
              return prev.map((g) => (g.id === updated.id ? updated : g));
            }
            fetchGroups();
            return prev;
          });
        }}
      />
    </div>
  );
}
