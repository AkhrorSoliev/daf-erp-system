"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { students } from "@/data/student-model";
import { Button } from "@/components/ui/button";
import {
  StudentsFilters,
  type StudentFilters,
} from "./students-filters";
import { StudentsStats } from "./students-stats";
import { StudentsTable } from "./students-table";

const PAGE_SIZE = 10;

const defaultFilters: StudentFilters = {
  fullName: "",
  id: "",
  status: "all",
  groupLevel: "all",
};

export function StudentsClient() {
  const [filters, setFilters] = useState<StudentFilters>(defaultFilters);
  const [page, setPage] = useState(1);

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

  const totalPages = Math.ceil(filteredStudents.length / PAGE_SIZE);
  const paginatedStudents = filteredStudents.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  const handleFilterChange = (newFilters: StudentFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <StudentsStats students={students} />
      <StudentsFilters filters={filters} onFilterChange={handleFilterChange} />
      <StudentsTable students={paginatedStudents} />
      {totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-muted-foreground text-sm">
            {`Jami: ${filteredStudents.length} ta o'quvchi`}
          </p>
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
    </div>
  );
}
