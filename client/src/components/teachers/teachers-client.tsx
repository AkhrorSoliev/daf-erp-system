"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TeachersTable } from "./teachers-table";
import { EditTeacherDrawer } from "./edit-teacher-drawer";
import { useEditTeacher, type TeacherData } from "@/hooks/use-edit-teacher";
import api from "@/lib/api";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

export function TeachersClient() {
  const [teachers, setTeachers] = useState<TeacherData[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const { openAddDrawer } = useEditTeacher();

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, per_page: pageSize };
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get("/teachers", { params });
      setTeachers(data.data);
      setTotal(data.total);
    } catch {
      // xatolik
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Ism bo'yicha qidirish..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openAddDrawer}>
          <Plus className="mr-2 size-4" />
          Yangi o&apos;qituvchi
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border">
          Yuklanmoqda...
        </div>
      ) : (
        <TeachersTable teachers={teachers} onRefresh={fetchTeachers} />
      )}

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
              Jami: {total} ta o&apos;qituvchi
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

      <EditTeacherDrawer onSaved={fetchTeachers} />
    </div>
  );
}
