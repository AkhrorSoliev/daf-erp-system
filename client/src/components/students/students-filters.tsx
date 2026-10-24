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
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
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
  { value: "active", label: msg("Faol") },
  { value: "frozen", label: msg("Muzlatilgan") },
  { value: "ungrouped", label: msg("Guruhlashtirilmagan") },
  { value: "graduated", label: msg("Bitirgan") },
  { value: "expelled", label: msg("Chetlatilgan") },
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
  const t = useT();
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

  const teacherOptions: MultiSelectOption[] = teachers.map((teacher) => ({
    value: String(teacher.id),
    label: `${teacher.firstName} ${teacher.lastName}`,
    avatarUrl: teacher.photo,
    initials: `${teacher.firstName[0] ?? ""}${teacher.lastName[0] ?? ""}`.toUpperCase(),
    count: teacher.studentCount ?? 0,
  }));

  const statusOptions: MultiSelectOption[] = STATUS_OPTIONS.map((o) => ({ ...o, label: t(o.label) }));

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
          placeholder={t("Ism, telefon yoki #ID bo'yicha...")}
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
          placeholder={t("Barcha guruhlar")}
          searchPlaceholder={t("Guruh qidirish...")}
          className="w-full sm:w-52"
        />
      )}

      {!isTeacher && (
        <MultiSelectCombobox
          options={statusOptions}
          selected={filters.status}
          onChange={(next) => updateFilter("status", next)}
          placeholder={t("Barcha holatlar")}
          searchPlaceholder={t("Holat qidirish...")}
          className="w-full sm:w-48"
        />
      )}

      <MultiSelectCombobox
        options={levelOptions}
        selected={filters.level}
        onChange={(next) => updateFilter("level", next)}
        placeholder={t("Barcha darajalar")}
        searchPlaceholder={t("Daraja qidirish...")}
        countSuffix={t("o'quvchi")}
        className="w-full sm:w-44"
      />

      {!isTeacher && (
        <MultiSelectCombobox
          options={teacherOptions}
          selected={filters.teacherId}
          onChange={(next) => updateFilter("teacherId", next)}
          placeholder={t("Barcha o'qituvchilar")}
          searchPlaceholder={t("O'qituvchi qidirish...")}
          countSuffix={t("o'quvchi")}
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
              {t("Tozalash")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("Barcha filtrlarni tozalash")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
