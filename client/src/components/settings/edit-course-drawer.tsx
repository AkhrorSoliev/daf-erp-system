"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useEditCourse } from "@/hooks/use-edit-course";
import type { Course } from "@/hooks/use-edit-course";
import { EditCourseForm } from "./edit-course-form";

interface EditCourseDrawerProps {
  onSaved?: (course: Course) => void;
}

export function EditCourseDrawer({ onSaved }: EditCourseDrawerProps) {
  const { open, mode, course, submitting, closeDrawer } = useEditCourse();

  const isAdd = mode === "add";

  if (!isAdd && !course) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && closeDrawer()}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">
            {isAdd ? "Yangi kurs qo'shish" : "Kursni tahrirlash"}
          </SheetTitle>
          <SheetDescription>
            {isAdd
              ? "Yangi kurs ma'lumotlarini kiriting"
              : "Kurs ma\u2019lumotlarini o\u2018zgartirish"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <EditCourseForm
            course={course}
            onClose={closeDrawer}
            onSaved={onSaved}
            formId="edit-course-form"
            isAdd={isAdd}
          />
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDrawer}>
              Bekor qilish
            </Button>
            <Button
              type="submit"
              form="edit-course-form"
              disabled={submitting}
            >
              {submitting ? "Saqlanmoqda..." : isAdd ? "Qo'shish" : "Saqlash"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
