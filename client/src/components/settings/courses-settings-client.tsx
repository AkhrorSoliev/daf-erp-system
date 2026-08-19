"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditCourse } from "@/hooks/use-edit-course";
import type { Course } from "@/hooks/use-edit-course";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { SettingsPageHeader } from "./settings-page-header";
import { CourseRowActions } from "./course-row-actions";
import { EditCourseDrawer } from "./edit-course-drawer";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";

const coursesSchema = {
  search: { type: "string" as const, defaultValue: "" },
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 10 },
};

export function CoursesSettingsClient() {
  const openAddDrawer = useEditCourse((s) => s.openAddDrawer);
  const user = useAuth((s) => s.user);
  // Yangi kurs qo'shish faqat CEO (1) va Filial direktori (2) uchun — backend'da
  // ham POST /courses @Roles('CEO', 'Branch Director'). Admin ko'ra oladi, qo'sha olmaydi.
  const canAddCourse = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const { filters, setFilter, setFilters: setUrlFilters } = useUrlFilters(coursesSchema);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [total, setTotal] = useState(0);

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setUrlFilters({ search: value, page: 1 });
  }, 300);

  const fetchCourses = useCallback(async () => {
    if (!branchLoaded || !selectedBranch) return;
    setLoading(true);
    try {
      const { data } = await api.get("/courses", {
        params: { branch_id: selectedBranch.id, page: filters.page, pageSize: filters.pageSize },
      });
      setCourses(data.data);
      setTotal(data.total);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [selectedBranch, branchLoaded, filters.page, filters.pageSize]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // Branch o'zgarganda page ni reset qilish
  useEffect(() => {
    setFilter("page", 1);
  }, [selectedBranch]);

  const filtered = courses.filter((c) =>
    c.name.toLowerCase().includes(filters.search.toLowerCase()),
  );

  const totalPages = Math.ceil(total / filters.pageSize);

  const handleSaved = (saved: Course) => {
    setCourses((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    fetchCourses();
  };

  const handleDeleted = (id: string) => {
    setCourses((prev) => prev.filter((c) => c.id !== id));
    setTotal((prev) => prev - 1);
  };

  if (!branchLoaded) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Kurslar"
        description="Mavjud kurslarni boshqarish va yangi kurslar qo'shish"
        action={
          canAddCourse ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={openAddDrawer}
                  disabled={!selectedBranch}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Yangi kurs
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {selectedBranch
                  ? "Yangi kurs qo\u2018shish"
                  : "Avval filial tanlang"}
              </TooltipContent>
            </Tooltip>
          ) : undefined
        }
      />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Kurs nomi bo'yicha qidirish..."
          value={searchInput}
          onChange={(e) => { setSearchInput(e.target.value); debouncedSetSearch(e.target.value); }}
          className="w-full sm:max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Kurs nomi</TableHead>
              <TableHead>Sikl darslari</TableHead>
              <TableHead>Narxi</TableHead>
              <TableHead>Holati</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <BookOpen className="h-8 w-8 text-muted-foreground/50" />
                    Kurslar topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((course, index) => (
                <TableRow
                  key={course.id}
                  className="relative cursor-pointer hover:bg-muted/50"
                >
                  <TableCell className="border-r text-muted-foreground">
                    {(filters.page - 1) * filters.pageSize + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/settings/courses/${course.id}`} className="absolute inset-0" />
                    {course.name}
                  </TableCell>
                  <TableCell>
                    {course.lessonPaymentCount
                      ? `${course.lessonPaymentCount} ta`
                      : "—"}
                  </TableCell>
                  <TableCell>{formatPrice(course.price)} so&apos;m</TableCell>
                  <TableCell>
                    <Badge
                      variant={course.isActive ? "default" : "secondary"}
                    >
                      {course.isActive ? "Faol" : "Nofaol"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <CourseRowActions
                      course={course}
                      onDeleted={handleDeleted}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Jami: {total} ta kurs
          </p>
          <div className="flex items-center gap-3">
            <Select
              value={String(filters.pageSize)}
              onValueChange={(v) => {
                setUrlFilters({ pageSize: Number(v), page: 1 });
              }}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 40, 50].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page <= 1}
                onClick={() => setFilter("page", filters.page - 1)}
              >
                Oldingi
              </Button>
              <span className="px-2 text-sm text-muted-foreground">
                {filters.page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page >= totalPages}
                onClick={() => setFilter("page", filters.page + 1)}
              >
                Keyingi
              </Button>
            </div>
          </div>
        </div>
      )}

      <EditCourseDrawer onSaved={handleSaved} />
    </div>
  );
}
