"use client";

import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

export type PaymentMethod = "CASH" | "PAYME" | "CLICK" | "UZUM" | "TRANSFER";

export interface StudentPaymentsFilter {
  branchId: number | null;
  groupIds: string[];
  teacherIds: number[];
  methods: PaymentMethod[];
  courseId: string[];
  rangeStart: Date | null;
  rangeEnd: Date | null;
}

export interface FilterOptions {
  groups: { id: string; name: string; branchId: number }[];
  teachers: { id: number; fullName: string }[];
  courses: { id: string; name: string }[];
}

interface Props {
  value: StudentPaymentsFilter;
  onChange: (next: StudentPaymentsFilter) => void;
  options: FilterOptions | undefined;
}

const ALL_BRANCHES = "all";

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Naqd",
  PAYME: "Payme",
  CLICK: "Click",
  UZUM: "Uzum",
  TRANSFER: "O'tkazma",
};

const METHOD_OPTIONS = (Object.keys(METHOD_LABELS) as PaymentMethod[]).map(
  (m) => ({ value: m, label: METHOD_LABELS[m] }),
);

export function defaultFilter(): StudentPaymentsFilter {
  return {
    branchId: null,
    groupIds: [],
    teacherIds: [],
    methods: [],
    courseId: [],
    rangeStart: null,
    rangeEnd: null,
  };
}

export function StudentPaymentsFilterBar({ value, onChange, options }: Props) {
  const branches = useBranchSwitcher((s) => s.branches);

  const groupOptions = (options?.groups ?? [])
    .filter((g) => (value.branchId ? g.branchId === value.branchId : true))
    .map((g) => ({ value: g.id, label: g.name }));

  const teacherOptions = (options?.teachers ?? []).map((t) => ({
    value: String(t.id),
    label: t.fullName,
  }));

  const hasCustomRange = value.rangeStart !== null && value.rangeEnd !== null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.branchId ? String(value.branchId) : ALL_BRANCHES}
        onValueChange={(v) =>
          onChange({
            ...value,
            branchId: v === ALL_BRANCHES ? null : Number(v),
            groupIds: [],
          })
        }
      >
        <SelectTrigger className="h-9 w-auto min-w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_BRANCHES}>Barcha filiallar</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b.id} value={String(b.id)}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <MultiSelectCombobox
        options={groupOptions}
        selected={value.groupIds}
        onChange={(next) => onChange({ ...value, groupIds: next })}
        placeholder="Barcha guruhlar"
        searchPlaceholder="Guruh qidirish..."
        className="min-w-[180px]"
      />

      <MultiSelectCombobox
        options={teacherOptions}
        selected={value.teacherIds.map(String)}
        onChange={(next) =>
          onChange({ ...value, teacherIds: next.map((v) => Number(v)) })
        }
        placeholder="Barcha o'qituvchilar"
        searchPlaceholder="O'qituvchi qidirish..."
        className="min-w-[200px]"
      />

      <MultiSelectCombobox
        options={METHOD_OPTIONS}
        selected={value.methods}
        onChange={(next) =>
          onChange({ ...value, methods: next as PaymentMethod[] })
        }
        placeholder="Barcha to'lov turlari"
        searchPlaceholder="Qidirish..."
        className="min-w-[180px]"
      />

      <MultiSelectCombobox
        options={(options?.courses ?? []).map((c) => ({
          value: c.id,
          label: c.name,
        }))}
        selected={value.courseId}
        onChange={(next) => onChange({ ...value, courseId: next })}
        placeholder="Barcha kurslar"
        searchPlaceholder="Kurs qidirish..."
        className="w-auto min-w-[160px]"
      />

      <div className="flex items-center gap-1">
        <DatePicker
          value={value.rangeStart}
          onChange={(d) => onChange({ ...value, rangeStart: d ?? null })}
          placeholder="Boshi"
          className="h-9 w-[140px]"
          maxDate={value.rangeEnd ?? undefined}
          defaultMonth={value.rangeEnd ?? undefined}
        />
        <span className="text-muted-foreground text-sm">—</span>
        <DatePicker
          value={value.rangeEnd}
          onChange={(d) => onChange({ ...value, rangeEnd: d ?? null })}
          placeholder="Oxiri"
          className="h-9 w-[140px]"
          minDate={value.rangeStart ?? undefined}
          defaultMonth={value.rangeStart ?? undefined}
        />
        {hasCustomRange && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              onChange({ ...value, rangeStart: null, rangeEnd: null })
            }
            className="h-9 w-9 shrink-0"
            aria-label="Oraliqni tozalash"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
