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
  status: string;
}

const defaultFilters: StudentFilters = {
  fullName: "",
  status: "all",
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
    filters.status !== "all";

  const updateFilter = (key: keyof StudentFilters, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-auto">
        <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input
          placeholder="Ism, telefon yoki ID bo'yicha..."
          value={filters.fullName}
          onChange={(e) => updateFilter("fullName", e.target.value)}
          className="w-full pl-9 sm:w-64"
        />
      </div>

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
