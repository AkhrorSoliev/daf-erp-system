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
import { useEditStudent } from "@/hooks/use-edit-student";
import { EditStudentForm } from "./edit-student-form";
import type { Student } from "@/data/student-model";

interface EditStudentDrawerProps {
  onSaved?: (student: Student) => void;
}

export function EditStudentDrawer({ onSaved }: EditStudentDrawerProps) {
  const { open, student, closeDrawer } = useEditStudent();

  if (!student) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && closeDrawer()}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">
            O&apos;quvchini tahrirlash
          </SheetTitle>
          <SheetDescription>
            O&apos;quvchi ma&apos;lumotlarini o&apos;zgartirish
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <EditStudentForm
            student={student}
            onClose={closeDrawer}
            onSaved={onSaved}
            formId="edit-student-form"
          />
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDrawer}>
              Bekor qilish
            </Button>
            <Button type="submit" form="edit-student-form">
              Saqlash
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
