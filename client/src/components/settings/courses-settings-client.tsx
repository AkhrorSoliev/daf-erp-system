"use client";

import { useRouter } from "next/navigation";
import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { courses } from "@/data/courses-model";
import { useEditCourse } from "@/hooks/use-edit-course";
import { SettingsPageHeader } from "./settings-page-header";
import { CourseRowActions } from "./course-row-actions";
import { EditCourseDrawer } from "./edit-course-drawer";

function formatPrice(price: number): string {
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " so'm";
}

export function CoursesSettingsClient() {
  const router = useRouter();
  const openAddDrawer = useEditCourse((s) => s.openAddDrawer);

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Kurslar"
        description="Mavjud kurslarni boshqarish va yangi kurslar qo'shish"
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={openAddDrawer}>
                <Plus className="mr-1.5 h-4 w-4" />
                Yangi kurs
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yangi kurs qo&apos;shish</TooltipContent>
          </Tooltip>
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kurs nomi</TableHead>
              <TableHead>Davomiyligi</TableHead>
              <TableHead>Darslar soni</TableHead>
              <TableHead>Narxi</TableHead>
              <TableHead>Holati</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <BookOpen className="h-8 w-8 text-muted-foreground/50" />
                    Kurslar topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              courses.map((course) => (
                <TableRow
                  key={course.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/settings/courses/${course.id}`)}
                >
                  <TableCell className="font-medium">{course.name}</TableCell>
                  <TableCell>{course.course_duration} oy</TableCell>
                  <TableCell>{course.lesson_duration} ta</TableCell>
                  <TableCell>{formatPrice(course.price)}</TableCell>
                  <TableCell>
                    <Badge variant={course.is_enabled ? "default" : "secondary"}>
                      {course.is_enabled ? "Faol" : "Nofaol"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <CourseRowActions course={course} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EditCourseDrawer />
    </div>
  );
}
