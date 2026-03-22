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
import { useAddStudentFromLead } from "@/hooks/use-add-student-from-lead";
import { AddStudentForm } from "./add-student-form";

export function AddStudentDrawer() {
  const { open, lead, closeDrawer } = useAddStudentFromLead();

  if (!lead) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && closeDrawer()}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col overflow-hidden p-0"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">
            O&apos;quvchi sifatida qo&apos;shish
          </SheetTitle>
          <SheetDescription>
            Lidni o&apos;quvchiga aylantirish
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <AddStudentForm
            lead={lead}
            onClose={closeDrawer}
            formId="add-student-from-lead"
          />
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDrawer}>
              Bekor qilish
            </Button>
            <Button type="submit" form="add-student-from-lead">
              Saqlash
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
