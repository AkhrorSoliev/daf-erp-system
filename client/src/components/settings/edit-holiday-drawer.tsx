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
import { useEditHoliday } from "@/hooks/use-edit-holiday";
import { EditHolidayForm } from "./edit-holiday-form";

export function EditHolidayDrawer() {
  const { open, holiday, closeDrawer } = useEditHoliday();

  if (!holiday) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && closeDrawer()}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">
            Dam olish kunini tahrirlash
          </SheetTitle>
          <SheetDescription>
            Bayram ma&apos;lumotlarini o&apos;zgartirish
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <EditHolidayForm
            holiday={holiday}
            onClose={closeDrawer}
            formId="edit-holiday-form"
          />
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDrawer}>
              Bekor qilish
            </Button>
            <Button type="submit" form="edit-holiday-form">
              Saqlash
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
