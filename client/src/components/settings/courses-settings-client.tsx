"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { SettingsPageHeader } from "./settings-page-header";
import { CourseRowActions } from "./course-row-actions";
import { EditCourseDrawer } from "./edit-course-drawer";
import api from "@/lib/api";

function formatPrice(price: number): string {
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " so'm";
}

export function CoursesSettingsClient() {
  const router = useRouter();
  const openAddDrawer = useEditCourse((s) => s.openAddDrawer);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const fetchCourses = useCallback(async () => {
    if (!branchLoaded || !selectedBranch) return;
    setLoading(true);
    try {
      const { data } = await api.get("/courses", {
        params: { branch_id: selectedBranch.id, page, pageSize },
      });
      setCourses(data.data);
      setTotal(data.total);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [selectedBranch, branchLoaded, page, pageSize]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // Branch o'zgarganda page ni reset qilish
  useEffect(() => {
    setPage(1);
  }, [selectedBranch]);

  const filtered = courses.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const totalPages = Math.ceil(total / pageSize);

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
        }
      />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Kurs nomi bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Kurs nomi</TableHead>
              <TableHead>Davomiyligi</TableHead>
              <TableHead>Darslar soni</TableHead>
              <TableHead>Narxi</TableHead>
              <TableHead>Holati</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
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
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    router.push(`/settings/courses/${course.id}`)
                  }
                >
                  <TableCell className="border-r text-muted-foreground">
                    {(page - 1) * pageSize + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">{course.name}</TableCell>
                  <TableCell>
                    {course.courseDuration
                      ? `${course.courseDuration} oy`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {course.lessonDuration
                      ? `${course.lessonDuration} ta`
                      : "—"}
                  </TableCell>
                  <TableCell>{formatPrice(course.price)}</TableCell>
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
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
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
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Oldingi
              </Button>
              <span className="px-2 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
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
