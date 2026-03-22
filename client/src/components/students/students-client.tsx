"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { students } from "@/data/student-model";
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
import { StudentsStats } from "./students-stats";
import { StudentsTable } from "./students-table";
import { EditStudentDrawer } from "./edit-student-drawer";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

const defaultFilters: StudentFilters = {
  fullName: "",
  id: "",
  status: "all",
  groupLevel: "all",
};

export function StudentsClient() {
  const [filters, setFilters] = useState<StudentFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredStudents = useMemo(() => {
    let result = students;

    if (filters.fullName) {
      const q = filters.fullName.toLowerCase();
      result = result.filter((s) =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)
      );
    }

    if (filters.id) {
      result = result.filter((s) => s.id.includes(filters.id));
    }

    if (filters.status && filters.status !== "all") {
      result = result.filter((s) => s.status === filters.status);
    }

    if (filters.groupLevel && filters.groupLevel !== "all") {
      result = result.filter((s) =>
        s.groups.some((g) => g.level === filters.groupLevel)
      );
    }

    return result;
  }, [filters]);

  const totalPages = Math.ceil(filteredStudents.length / pageSize);
  const paginatedStudents = filteredStudents.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const handleFilterChange = (newFilters: StudentFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <StudentsStats students={students} />
      <StudentsFilters filters={filters} onFilterChange={handleFilterChange} />
      <StudentsTable students={paginatedStudents} />
      {totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Sahifada:</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
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
              {`Jami: ${filteredStudents.length} ta o'quvchi`}
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
      <EditStudentDrawer />
    </div>
  );
}
