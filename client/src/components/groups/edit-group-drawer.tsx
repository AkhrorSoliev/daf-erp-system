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
import { useEditGroup } from "@/hooks/use-edit-group";
import { EditGroupForm } from "./edit-group-form";
import type { GroupData } from "@/hooks/use-edit-group";

interface EditGroupDrawerProps {
  onSaved?: (updated: GroupData) => void;
}

export function EditGroupDrawer({ onSaved }: EditGroupDrawerProps) {
  const { open, mode, group, submitting, hasConflict, closeDrawer } = useEditGroup();
  const isAdd = mode === "add";

  if (!isAdd && !group) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && closeDrawer()}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">
            {isAdd ? "Yangi guruh qo'shish" : "Guruhni tahrirlash"}
          </SheetTitle>
          <SheetDescription>
            {isAdd
              ? "Yangi guruh ma'lumotlarini kiriting"
              : "Guruh ma'lumotlarini o'zgartirish"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <EditGroupForm
            group={group}
            isAdd={isAdd}
            onClose={closeDrawer}
            onSaved={onSaved}
            formId="edit-group-form"
          />
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDrawer}>
              Bekor qilish
            </Button>
            <Button type="submit" form="edit-group-form" disabled={submitting || hasConflict}>
              {submitting ? "Saqlanmoqda..." : isAdd ? "Qo'shish" : "Saqlash"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
