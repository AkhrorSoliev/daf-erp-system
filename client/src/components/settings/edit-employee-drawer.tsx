"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditEmployee, type EmployeeUser } from "@/hooks/use-edit-employee";
import { EditEmployeeForm } from "./edit-employee-form";

interface EditEmployeeDrawerProps {
  onSaved?: (data: EmployeeUser) => void;
}

export function EditEmployeeDrawer({ onSaved }: EditEmployeeDrawerProps) {
  const { open, mode, employee, submitting, closeDrawer } = useEditEmployee();

  const isAdd = mode === "add";

  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && closeDrawer()}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">
            {isAdd ? "Yangi xodim qo'shish" : "Xodimni tahrirlash"}
          </SheetTitle>
          <SheetDescription>
            {isAdd
              ? "Yangi xodim ma'lumotlarini kiriting"
              : "Xodim ma\u2019lumotlarini o\u2018zgartirish"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <EditEmployeeForm
            employee={employee}
            onClose={closeDrawer}
            onSaved={onSaved}
            formId="edit-employee-form"
          />
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDrawer} disabled={submitting}>
              Bekor qilish
            </Button>
            <Button type="submit" form="edit-employee-form" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {isAdd ? "Qo'shish" : "Saqlash"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
