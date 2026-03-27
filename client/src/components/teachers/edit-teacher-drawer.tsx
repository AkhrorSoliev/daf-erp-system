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

interface EditTeacherDrawerProps {
  onSaved?: (updated: import("@/hooks/use-edit-teacher").TeacherData) => void;
}

export function EditTeacherDrawer({ onSaved }: EditTeacherDrawerProps) {
  const { open, mode, teacher, submitting, closeDrawer } = useEditTeacher();
  const isAdd = mode === "add";

  if (!isAdd && !teacher) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && closeDrawer()}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">
            {isAdd ? "Yangi o'qituvchi qo'shish" : "O'qituvchini tahrirlash"}
          </SheetTitle>
          <SheetDescription>
            {isAdd
              ? "Yangi o'qituvchi ma'lumotlarini kiriting"
              : "O'qituvchi ma'lumotlarini o'zgartirish"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <EditTeacherForm
            teacher={teacher}
            isAdd={isAdd}
            onClose={closeDrawer}
            onSaved={onSaved}
            formId="edit-teacher-form"
          />
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDrawer}>
              Bekor qilish
            </Button>
            <Button type="submit" form="edit-teacher-form" disabled={submitting}>
              {submitting ? "Saqlanmoqda..." : isAdd ? "Qo'shish" : "Saqlash"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
