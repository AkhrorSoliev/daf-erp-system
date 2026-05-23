"use client";

import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useEditHoliday, type Holiday } from "@/hooks/use-edit-holiday";
import { EditHolidayForm } from "./edit-holiday-form";

interface EditHolidayDrawerProps {
  onSaved?: (holiday: Holiday) => void;
}

export function EditHolidayDrawer({ onSaved }: EditHolidayDrawerProps) {
  const { open, mode, holiday, submitting, closeDrawer } = useEditHoliday();
  const isAdd = mode === "add";

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => !isOpen && !submitting && closeDrawer()}
    >
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">
            {isAdd
              ? "Yangi dam olish kuni qo'shish"
              : "Dam olish kunini tahrirlash"}
          </SheetTitle>
          <SheetDescription>
            {isAdd
              ? "Yangi bayram ma'lumotlarini kiriting"
              : "Bayram ma'lumotlarini o'zgartirish"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <EditHolidayForm
            holiday={holiday}
            onClose={closeDrawer}
            onSaved={onSaved}
            formId="edit-holiday-form"
            isAdd={isAdd}
          />
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={closeDrawer}
              disabled={submitting}
            >
              Bekor qilish
            </Button>
            <Button
              type="submit"
              form="edit-holiday-form"
              disabled={submitting}
            >
              {submitting && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {isAdd ? "Qo'shish" : "Saqlash"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
