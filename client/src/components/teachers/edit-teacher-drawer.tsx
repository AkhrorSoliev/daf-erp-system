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
import { useEditTeacher } from "@/hooks/use-edit-teacher";
import { EditTeacherForm } from "./edit-teacher-form";

export function EditTeacherDrawer() {
  const { open, teacher, closeDrawer } = useEditTeacher();

  if (!teacher) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && closeDrawer()}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col overflow-hidden p-0"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">
            O&apos;qituvchini tahrirlash
          </SheetTitle>
          <SheetDescription>
            O&apos;qituvchi ma&apos;lumotlarini o&apos;zgartirish
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <EditTeacherForm
            teacher={teacher}
            onClose={closeDrawer}
            formId="edit-teacher-form"
          />
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDrawer}>
              Bekor qilish
            </Button>
            <Button type="submit" form="edit-teacher-form">
              Saqlash
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
