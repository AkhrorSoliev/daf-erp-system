"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MultiSelectCombobox,
  type MultiSelectOption,
} from "@/components/ui/multi-select-combobox";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

export interface StudentFilters {
  fullName: string;
  /** Bo'sh ro'yxat = «Barcha ...». */
  status: string[];
  teacherId: string[];
  groupId: string[];
  level: string[];
}

const defaultFilters: StudentFilters = {
  fullName: "",
  status: [],
  teacherId: [],
  groupId: [],
  level: [],
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

const STATUS_OPTIONS: MultiSelectOption[] = [
  { value: "active", label: "Faol" },
  { value: "frozen", label: "Muzlatilgan" },
  { value: "ungrouped", label: "Guruhlashtirilmagan" },
  { value: "graduated", label: "Bitirgan" },
  { value: "expelled", label: "Chetlatilgan" },
];

interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
  photo?: string | null;
  studentCount?: number;
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
  /** Har bir daraja bo'yicha o'quvchilar soni (dropdownda ko'rsatish uchun). */
  levelCounts?: Record<string, number>;
}

export function StudentsFilters({
  filters,
  onFilterChange,
  onClear,
  isTeacher,
  groups,
  levelCounts,
}: StudentsFiltersProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);

  const branchId = selectedBranch?.id;

  useEffect(() => {
    if (isTeacher) return;
    let cancelled = false;
    (async () => {
      try {
        const params: Record<string, unknown> = { pageSize: 100 };
        if (branchId) params.branch_id = branchId;
        // `/teachers` har bir o'qituvchining faol o'quvchilar sonini
        // (`studentCount`) ham qaytaradi — dropdownda ko'rsatamiz.
        const { data } = await api.get("/teachers", { params });
        if (!cancelled) setTeachers(data.data);
      } catch {
        // xatolik
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTeacher, branchId]);

  const hasActiveFilters =
    filters.fullName !== "" ||
    filters.groupId.length > 0 ||
    filters.level.length > 0 ||
    (!isTeacher && (filters.status.length > 0 || filters.teacherId.length > 0));

  const updateFilter = (
    key: keyof StudentFilters,
    value: string | string[],
  ) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const teacherOptions: MultiSelectOption[] = teachers.map((t) => ({
    value: String(t.id),
    label: `${t.firstName} ${t.lastName}`,
    avatarUrl: t.photo,
    initials: `${t.firstName[0] ?? ""}${t.lastName[0] ?? ""}`.toUpperCase(),
    count: t.studentCount ?? 0,
  }));

  const levelOptions: MultiSelectOption[] = LEVELS.map((lvl) => ({
    value: lvl,
    label: lvl,
    count: levelCounts?.[lvl] ?? 0,
  }));

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
        <MultiSelectCombobox
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
          selected={filters.groupId}
          onChange={(next) => updateFilter("groupId", next)}
          placeholder="Barcha guruhlar"
          searchPlaceholder="Guruh qidirish..."
          className="w-full sm:w-52"
        />
      )}

      {!isTeacher && (
        <MultiSelectCombobox
          options={STATUS_OPTIONS}
          selected={filters.status}
          onChange={(next) => updateFilter("status", next)}
          placeholder="Barcha holatlar"
          searchPlaceholder="Holat qidirish..."
          className="w-full sm:w-48"
        />
      )}

      <MultiSelectCombobox
        options={levelOptions}
        selected={filters.level}
        onChange={(next) => updateFilter("level", next)}
        placeholder="Barcha darajalar"
        searchPlaceholder="Daraja qidirish..."
        countSuffix="o'quvchi"
        className="w-full sm:w-44"
      />

      {!isTeacher && (
        <MultiSelectCombobox
          options={teacherOptions}
          selected={filters.teacherId}
          onChange={(next) => updateFilter("teacherId", next)}
          placeholder="Barcha o'qituvchilar"
          searchPlaceholder="O'qituvchi qidirish..."
          countSuffix="o'quvchi"
          className="w-full sm:w-52"
          contentClassName="w-[288px]"
        />
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
