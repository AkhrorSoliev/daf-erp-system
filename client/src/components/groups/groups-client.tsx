"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
import { GroupsStats, type GroupsStatsData } from "./groups-stats";
import { EditGroupDrawer } from "./edit-group-drawer";
import { LevelBadge } from "./level-badge";
import { useEditGroup, type GroupData } from "@/hooks/use-edit-group";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { listParam, useUrlFilters } from "@/hooks/use-url-filters";
import {
  MultiSelectCombobox,
  type MultiSelectOption,
} from "@/components/ui/multi-select-combobox";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import api from "@/lib/api";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

interface RoomOption {
  id: number;
  name: string;
}

interface TeacherOption {
  id: number;
  firstName: string;
  lastName: string;
}

const LEVEL_OPTIONS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Faol" },
  { value: "FORMING", label: "Boshlanmagan" },
  { value: "PAUSED", label: "Pauza" },
  { value: "COMPLETED", label: "Tugallangan" },
];

const COURSE_TYPE_OPTIONS = [
  { value: "standard", label: "Standart" },
  { value: "intensive", label: "Intensiv" },
];

interface FilterCounts {
  status: Record<string, number>;
  level: Record<string, number>;
  courseType: Record<string, number>;
  room: Record<string, number>;
  teacher: Record<string, number>;
}

const EMPTY_FILTER_COUNTS: FilterCounts = {
  status: {},
  level: {},
  courseType: {},
  room: {},
  teacher: {},
};

// Bo'sh ro'yxat = «Barcha ...». Sanagichlar filialga bog'liq, tanlovga emas,
// shuning uchun ular ko'p tanlashda ham barqaror qoladi.
const filtersSchema = {
  search: { type: "string" as const, defaultValue: "" },
  status: { type: "array" as const, defaultValue: [] as string[] },
  level: { type: "array" as const, defaultValue: [] as string[] },
  courseType: { type: "array" as const, defaultValue: [] as string[] },
  room: { type: "array" as const, defaultValue: [] as string[] },
  teacher: { type: "array" as const, defaultValue: [] as string[] },
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 10 },
};

export function GroupsClient() {
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<GroupsStatsData>({ total: 0, active: 0, forming: 0, paused: 0, completed: 0 });
  const [filterCounts, setFilterCounts] = useState<FilterCounts>(EMPTY_FILTER_COUNTS);
  const { filters, setFilter, setFilters: setUrlFilters } = useUrlFilters(filtersSchema);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [loading, setLoading] = useState(true);
  const { openAddDrawer } = useEditGroup();
  const user = useAuth((s) => s.user);
  const canManage = user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;
  const isTeacherOnly =
    (user?.roles.some((r) => r.id === 4) && !canManage) ?? false;
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setUrlFilters({ search: value, page: 1 });
  }, 300);

  const fetchFilterOptions = useCallback(async () => {
    // No early return on a missing branch any more: null now means "Barcha
    // filiallar" (a real CEO selection), and bailing out left the room and
    // teacher dropdowns permanently empty in that view. The server scopes both
    // lists from the request's branch header, so omitting the parameter is
    // exactly right for the consolidated view.
    try {
      const branchParam = selectedBranch
        ? { branch_id: selectedBranch.id }
        : {};
      const [roomsRes, teachersRes] = await Promise.all([
        api.get("/rooms", { params: { ...branchParam, page: 1, pageSize: 100 } }),
        api.get("/users", { params: { ...branchParam, user_type: "Teacher", pageSize: 100 } }),
      ]);
      setRooms(roomsRes.data.data.map((r: any) => ({ id: r.id, name: r.name })));
      setTeachers(teachersRes.data.data.map((t: any) => ({ id: t.id, firstName: t.firstName, lastName: t.lastName })));
    } catch {
      // xatolik
    }
  }, [selectedBranch]);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  const fetchGroups = useCallback(async () => {
    // Wait for the branch store to HYDRATE, but do not require a branch to be
    // picked — `selectedBranch === null` is the CEO's "Barcha filiallar", and
    // treating it as "not ready" showed them a permanently empty group list.
    if (!isTeacherOnly && !branchLoaded) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page: filters.page,
        pageSize: filters.pageSize,
      };
      if (selectedBranch) params.branch_id = selectedBranch.id;
      if (filters.search.trim()) params.search = filters.search.trim();
      params.statusEnum = listParam(filters.status);
      params.level = listParam(filters.level);
      params.course_type = listParam(filters.courseType);
      params.room_id = listParam(filters.room);
      params.teacher_id = listParam(filters.teacher);
      const { data } = await api.get("/groups", { params });
      setGroups(data.data);
      setTotal(data.total);
      if (data.stats) setStats(data.stats);
      setFilterCounts(data.filterCounts ?? EMPTY_FILTER_COUNTS);
    } catch {
      // xatolik
    } finally {
      setLoading(false);
    }
  }, [
    filters.page,
    filters.pageSize,
    filters.search,
    filters.status,
    filters.level,
    filters.courseType,
    filters.room,
    filters.teacher,
    selectedBranch,
    branchLoaded,
    isTeacherOnly,
  ]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  const handleSearch = (value: string) => {
    setSearchInput(value);
    debouncedSetSearch(value);
  };

  const handlePageSizeChange = (value: string) => {
    setUrlFilters({ pageSize: Number(value), page: 1 });
  };


  const statusOptions: MultiSelectOption[] = STATUS_OPTIONS.map((o) => ({
    ...o,
    count: filterCounts.status[o.value] ?? 0,
  }));

  const levelOptions: MultiSelectOption[] = LEVEL_OPTIONS.map((level) => ({
    value: level,
    label: level,
    leading: <LevelBadge level={level} />,
    count: filterCounts.level[level] ?? 0,
  }));

  const courseTypeOptions: MultiSelectOption[] = COURSE_TYPE_OPTIONS.map((o) => ({
    ...o,
    count: filterCounts.courseType[o.value] ?? 0,
  }));

  const roomOptions: MultiSelectOption[] = rooms.map((r) => ({
    value: String(r.id),
    label: r.name,
    count: filterCounts.room[String(r.id)] ?? 0,
  }));

  const teacherOptions: MultiSelectOption[] = teachers.map((t) => ({
    value: String(t.id),
    label: `${t.lastName} ${t.firstName}`,
    count: filterCounts.teacher[String(t.id)] ?? 0,
  }));

  return (
    <div className="space-y-4">
      <GroupsStats stats={stats} loading={loading} />
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Nomi bo'yicha qidirish..."
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <MultiSelectCombobox
          options={statusOptions}
          selected={filters.status}
          onChange={(next) => setUrlFilters({ status: next, page: 1 })}
          placeholder="Barcha holatlar"
          searchPlaceholder="Holat qidirish..."
          countSuffix="guruh"
          className="w-[calc(100%-3rem)] sm:w-44"
        />
        <MultiSelectCombobox
          options={levelOptions}
          selected={filters.level}
          onChange={(next) => setUrlFilters({ level: next, page: 1 })}
          placeholder="Barcha darajalar"
          searchPlaceholder="Daraja qidirish..."
          countSuffix="guruh"
          className="w-[calc(100%-3rem)] sm:w-44"
        />
        <MultiSelectCombobox
          options={courseTypeOptions}
          selected={filters.courseType}
          onChange={(next) => setUrlFilters({ courseType: next, page: 1 })}
          placeholder="Barcha turlar"
          searchPlaceholder="Tur qidirish..."
          countSuffix="guruh"
          className="w-[calc(100%-3rem)] sm:w-44"
        />
        <MultiSelectCombobox
          options={roomOptions}
          selected={filters.room}
          onChange={(next) => setUrlFilters({ room: next, page: 1 })}
          placeholder="Barcha xonalar"
          searchPlaceholder="Xona qidirish..."
          countSuffix="guruh"
          className="w-[calc(100%-3rem)] sm:w-44"
        />
        {!isTeacherOnly && (
          <MultiSelectCombobox
            options={teacherOptions}
            selected={filters.teacher}
            onChange={(next) => setUrlFilters({ teacher: next, page: 1 })}
            placeholder="Barcha o'qituvchilar"
            searchPlaceholder="O'qituvchi qidirish..."
            countSuffix="guruh"
            className="w-[calc(100%-3rem)] sm:w-48"
            contentClassName="w-[288px]"
          />
        )}
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
        <div className="overflow-x-auto rounded-md border">
          <div className="space-y-0">
            <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="hidden h-4 w-20 sm:block" />
              <Skeleton className="hidden h-4 w-20 md:block" />
              <Skeleton className="hidden h-4 w-16 md:block" />
              <Skeleton className="ml-auto h-4 w-16" />
              <Skeleton className="h-4 w-8" />
            </div>
            {Array.from({ length: filters.pageSize > 5 ? 5 : filters.pageSize }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b px-4 py-3">
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="hidden h-4 w-20 sm:block" />
                <Skeleton className="hidden h-4 w-20 md:block" />
                <Skeleton className="hidden h-4 w-16 md:block" />
                <Skeleton className="ml-auto h-4 w-16" />
                <Skeleton className="h-4 w-8" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <GroupsTable
          groups={groups}
          page={filters.page}
          pageSize={filters.pageSize}
          onDeleted={(id) => {
            setGroups((prev) => prev.filter((g) => g.id !== id));
            setTotal((prev) => Math.max(0, prev - 1));
          }}
          onStatusChanged={(id, newStatus) => {
            setGroups((prev) =>
              prev.map((g) =>
                g.id === id ? { ...g, statusEnum: newStatus } : g,
              ),
            );
          }}
        />
      )}

      {totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Sahifada:</span>
            <Select
              value={String(filters.pageSize)}
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
