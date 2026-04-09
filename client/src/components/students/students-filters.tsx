"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

export interface StudentFilters {
  fullName: string;
  status: string;
  teacherId: string;
  groupId: string;
}

const defaultFilters: StudentFilters = {
  fullName: "",
  status: "all",
  teacherId: "all",
  groupId: "all",
};

interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
  photo?: string | null;
}

interface GroupOption {
  id: string;
  name: string;
}

interface StudentsFiltersProps {
  filters: StudentFilters;
  onFilterChange: (filters: StudentFilters) => void;
  onClear?: () => void;
  isTeacher?: boolean;
  groups?: GroupOption[];
}

export function StudentsFilters({
  filters,
  onFilterChange,
  onClear,
  isTeacher,
  groups,
}: StudentsFiltersProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherPopoverOpen, setTeacherPopoverOpen] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState("");
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);

  const fetchTeachers = useCallback(async () => {
    try {
      const params: Record<string, any> = { user_type: "Teacher", pageSize: 100 };
      if (selectedBranch?.id) params.branch_id = selectedBranch.id;
      const { data } = await api.get("/users", { params });
      setTeachers(data.data);
    } catch {
      // xatolik
    }
  }, [selectedBranch?.id]);

  useEffect(() => {
    if (!isTeacher) fetchTeachers();
  }, [fetchTeachers, isTeacher]);

  const selectedTeacher = useMemo(
    () => teachers.find((t) => String(t.id) === filters.teacherId),
    [teachers, filters.teacherId],
  );

  const filteredTeachers = useMemo(
    () =>
      teacherSearch.trim()
        ? teachers.filter((t) =>
            `${t.firstName} ${t.lastName}`.toLowerCase().includes(teacherSearch.toLowerCase()),
          )
        : teachers,
    [teachers, teacherSearch],
  );

  const hasActiveFilters =
    filters.fullName !== "" ||
    filters.groupId !== "all" ||
    (!isTeacher && (filters.status !== "all" || filters.teacherId !== "all"));

  const updateFilter = (key: keyof StudentFilters, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-auto">
        <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input
          placeholder="Ism, telefon yoki #ID bo'yicha..."
          value={filters.fullName}
          onChange={(e) => updateFilter("fullName", e.target.value)}
          className="w-full pl-9 sm:w-64"
        />
      </div>

      {isTeacher && groups && groups.length > 0 && (
        <Select
          value={filters.groupId}
          onValueChange={(value) => updateFilter("groupId", value)}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha guruhlar</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!isTeacher && (
        <Select
          value={filters.status}
          onValueChange={(value) => updateFilter("status", value)}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha holatlar</SelectItem>
            <SelectItem value="active">Faol</SelectItem>
            <SelectItem value="frozen">Muzlatilgan</SelectItem>
            <SelectItem value="ungrouped">Guruhlashtirilmagan</SelectItem>
            <SelectItem value="graduated">Bitirgan</SelectItem>
            <SelectItem value="expelled">Chetlatilgan</SelectItem>
          </SelectContent>
        </Select>
      )}

      {!isTeacher && (
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
              className="h-9 w-full min-w-0 justify-between font-normal sm:w-52"
            >
              {selectedTeacher ? (
                <span className="flex items-center gap-2">
                  <Avatar size="sm">
                    {selectedTeacher.photo && (
                      <AvatarImage
                        src={selectedTeacher.photo}
                        alt={`${selectedTeacher.firstName} ${selectedTeacher.lastName}`}
                      />
                    )}
                    <AvatarFallback>
                      {`${selectedTeacher.firstName[0] ?? ""}${selectedTeacher.lastName[0] ?? ""}`.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {selectedTeacher.firstName} {selectedTeacher.lastName}
                </span>
              ) : (
                <span className="text-muted-foreground">Barcha o&apos;qituvchilar</span>
              )}
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 gap-0 p-0" align="start">
            <div className="border-b p-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                <Input
                  placeholder="Qidirish..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="max-h-52 space-y-1 overflow-y-auto overscroll-contain p-2">
              {filteredTeachers.map((t) => {
                const isSelected = filters.teacherId === String(t.id);
                const fullName = `${t.firstName} ${t.lastName}`;
                const initials = `${t.firstName[0] ?? ""}${t.lastName[0] ?? ""}`.toUpperCase();
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      updateFilter("teacherId", isSelected ? "all" : String(t.id));
                      setTeacherPopoverOpen(false);
                      setTeacherSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                      isSelected && "bg-accent",
                    )}
                  >
                    <Avatar size="sm">
                      {t.photo && <AvatarImage src={t.photo} alt={fullName} />}
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
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

      {hasActiveFilters && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onClear ? onClear() : onFilterChange(defaultFilters)}
            >
              <X className="mr-1 size-4" />
              Tozalash
            </Button>
          </TooltipTrigger>
          <TooltipContent>Barcha filtrlarni tozalash</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
