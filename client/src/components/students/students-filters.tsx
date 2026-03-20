"use client";

import { Search, X } from "lucide-react";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface StudentFilters {
  fullName: string;
  id: string;
  status: string;
  groupLevel: string;
}

const defaultFilters: StudentFilters = {
  fullName: "",
  id: "",
  status: "all",
  groupLevel: "all",
};

interface StudentsFiltersProps {
  filters: StudentFilters;
  onFilterChange: (filters: StudentFilters) => void;
}

export function StudentsFilters({
  filters,
  onFilterChange,
}: StudentsFiltersProps) {
  const hasActiveFilters =
    filters.fullName !== "" ||
    filters.id !== "" ||
    filters.status !== "all" ||
    filters.groupLevel !== "all";

  const updateFilter = (key: keyof StudentFilters, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-auto">
        <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input
          placeholder="Ism bo'yicha qidirish..."
          value={filters.fullName}
          onChange={(e) => updateFilter("fullName", e.target.value)}
          className="w-full pl-9 sm:w-48"
        />
      </div>

      <Input
        placeholder="ID bo'yicha qidirish..."
        value={filters.id}
        onChange={(e) => updateFilter("id", e.target.value)}
        className="w-full sm:w-40"
      />

      <Select
        value={filters.status}
        onValueChange={(value) => updateFilter("status", value)}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="Holat" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Barchasi</SelectItem>
          <SelectItem value="active">Faol</SelectItem>
          <SelectItem value="frozen">Muzlatilgan</SelectItem>
          <SelectItem value="ungrouped">Guruhlashtirilmagan</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.groupLevel}
        onValueChange={(value) => updateFilter("groupLevel", value)}
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Guruh darajasi" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Barchasi</SelectItem>
          <SelectItem value="A1">A1</SelectItem>
          <SelectItem value="A2">A2</SelectItem>
          <SelectItem value="B1">B1</SelectItem>
          <SelectItem value="B2">B2</SelectItem>
          <SelectItem value="C1">C1</SelectItem>
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFilterChange(defaultFilters)}
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
