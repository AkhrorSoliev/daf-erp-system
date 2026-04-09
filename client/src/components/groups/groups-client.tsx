"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GroupsTable } from "./groups-table";
import { GroupsStats, type GroupsStatsData } from "./groups-stats";
import { EditGroupDrawer } from "./edit-group-drawer";
import { useEditGroup, type GroupData } from "@/hooks/use-edit-group";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useUrlFilters } from "@/hooks/use-url-filters";
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

const filtersSchema = {
  search: { type: "string" as const, defaultValue: "" },
  status: { type: "string" as const, defaultValue: "all" },
  room: { type: "string" as const, defaultValue: "all" },
  teacher: { type: "string" as const, defaultValue: "all" },
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 10 },
};

export function GroupsClient() {
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<GroupsStatsData>({ total: 0, active: 0, forming: 0, paused: 0, completed: 0 });
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
  const [roomPopoverOpen, setRoomPopoverOpen] = useState(false);
  const [roomSearch, setRoomSearch] = useState("");
  const [teacherPopoverOpen, setTeacherPopoverOpen] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState("");

  const selectedRoom = useMemo(
    () => rooms.find((r) => String(r.id) === filters.room),
    [rooms, filters.room],
  );

  const filteredRooms = useMemo(
    () =>
      roomSearch.trim()
        ? rooms.filter((r) =>
            r.name.toLowerCase().includes(roomSearch.toLowerCase()),
          )
        : rooms,
    [rooms, roomSearch],
  );

  const selectedTeacher = useMemo(
    () => teachers.find((t) => String(t.id) === filters.teacher),
    [teachers, filters.teacher],
  );

  const filteredTeachers = useMemo(
    () =>
      teacherSearch.trim()
        ? teachers.filter((t) =>
            `${t.lastName} ${t.firstName}`.toLowerCase().includes(teacherSearch.toLowerCase()),
          )
        : teachers,
    [teachers, teacherSearch],
  );

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setUrlFilters({ search: value, page: 1 });
  }, 300);

  const fetchFilterOptions = useCallback(async () => {
    if (!selectedBranch) return;
    try {
      const [roomsRes, teachersRes] = await Promise.all([
        api.get("/rooms", { params: { branch_id: selectedBranch.id, page: 1, pageSize: 100 } }),
        api.get("/users", { params: { branch_id: selectedBranch.id, user_type: "Teacher", per_page: 100 } }),
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
    if (!isTeacherOnly && (!branchLoaded || !selectedBranch)) {
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
      if (filters.status !== "all") {
        params.statusEnum = filters.status;
      }
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.room !== "all") params.room_id = filters.room;
      if (filters.teacher !== "all") params.teacher_id = Number(filters.teacher);
      const { data } = await api.get("/groups", { params });
      setGroups(data.data);
      setTotal(data.total);
      if (data.stats) setStats(data.stats);
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


  const handleRoomChange = (value: string) => {
    setUrlFilters({ room: value, page: 1 });
  };

  const handleTeacherChange = (value: string) => {
    setUrlFilters({ teacher: value, page: 1 });
  };

  return (
    <div className="space-y-4">
      <GroupsStats
        stats={filters.status !== "all" ? { ...stats, total } : stats}
        loading={loading}
        activeStatus={filters.status}
        onStatusClick={(status) => {
          const newStatus = status === filters.status ? "all" : status;
          setUrlFilters({ status: newStatus, page: 1 });
        }}
      />
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
        <Popover
          modal
          open={roomPopoverOpen}
          onOpenChange={(open) => {
            setRoomPopoverOpen(open);
            if (!open) setRoomSearch("");
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              type="button"
              className="h-9 w-[calc(100%-3rem)] min-w-0 justify-between font-normal sm:w-44"
            >
              <span className={cn(!selectedRoom && "text-muted-foreground")}>
                {selectedRoom ? selectedRoom.name : "Barcha xonalar"}
              </span>
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 gap-0 p-0" align="start">
            <div className="border-b p-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                <Input
                  placeholder="Xona qidirish..."
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="max-h-52 space-y-1 overflow-y-auto overscroll-contain p-2">
              <button
                type="button"
                onClick={() => {
                  handleRoomChange("all");
                  setRoomPopoverOpen(false);
                  setRoomSearch("");
                }}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                  filters.room === "all" && "bg-accent",
                )}
              >
                <span className="truncate flex-1 text-left">Barcha xonalar</span>
              </button>
              {filteredRooms.map((room) => {
                const isSelected = filters.room === String(room.id);
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => {
                      handleRoomChange(isSelected ? "all" : String(room.id));
                      setRoomPopoverOpen(false);
                      setRoomSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                      isSelected && "bg-accent",
                    )}
                  >
                    <span className="truncate flex-1 text-left">{room.name}</span>
                  </button>
                );
              })}
              {filteredRooms.length === 0 && (
                <p className="text-muted-foreground px-2 py-1.5 text-sm">
                  Xonalar topilmadi
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
        {!isTeacherOnly && (
          <Popover
            modal
            open={teacherPopoverOpen}
            onOpenChange={(open) => {
              setTeacherPopoverOpen(open);
              if (!open) setTeacherSearch("");
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                type="button"
                className="h-9 w-[calc(100%-3rem)] min-w-0 justify-between font-normal sm:w-48"
              >
                <span className={cn(!selectedTeacher && "text-muted-foreground")}>
                  {selectedTeacher
                    ? `${selectedTeacher.lastName} ${selectedTeacher.firstName}`
                    : "Barcha o\u2018qituvchilar"}
                </span>
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 gap-0 p-0" align="start">
              <div className="border-b p-2">
                <div className="relative">
                  <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                  <Input
                    placeholder="O&#39;qituvchi qidirish..."
                    value={teacherSearch}
                    onChange={(e) => setTeacherSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto overscroll-contain p-2">
                <button
                  type="button"
                  onClick={() => {
                    handleTeacherChange("all");
                    setTeacherPopoverOpen(false);
                    setTeacherSearch("");
                  }}
                  className={cn(
                    "flex w-full items-center rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                    filters.teacher === "all" && "bg-accent",
                  )}
                >
                  <span className="truncate flex-1 text-left">Barcha o&apos;qituvchilar</span>
                </button>
                {filteredTeachers.map((teacher) => {
                  const isSelected = filters.teacher === String(teacher.id);
                  const fullName = `${teacher.lastName} ${teacher.firstName}`;
                  return (
                    <button
                      key={teacher.id}
                      type="button"
                      onClick={() => {
                        handleTeacherChange(isSelected ? "all" : String(teacher.id));
                        setTeacherPopoverOpen(false);
                        setTeacherSearch("");
                      }}
                      className={cn(
                        "flex w-full items-center rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                        isSelected && "bg-accent",
                      )}
                    >
                      <span className="truncate flex-1 text-left">{fullName}</span>
                    </button>
                  );
                })}
                {filteredTeachers.length === 0 && (
                  <p className="text-muted-foreground px-2 py-1.5 text-sm">
                    O&apos;qituvchilar topilmadi
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>
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
        <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border">
          Yuklanmoqda...
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
