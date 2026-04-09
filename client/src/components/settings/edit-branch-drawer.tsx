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
import { useEditBranch } from "@/hooks/use-edit-branch";
import { EditBranchForm } from "./edit-branch-form";
import type { Branch } from "@/hooks/use-edit-branch";

interface EditBranchDrawerProps {
  onSaved?: (branch: Branch) => void;
}

export function EditBranchDrawer({ onSaved }: EditBranchDrawerProps) {
  const { open, mode, branch, submitting, closeDrawer } = useEditBranch();

  const isAdd = mode === "add";

  if (!isAdd && !branch) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && closeDrawer()}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">
            {isAdd ? "Yangi filial qo'shish" : "Filialni tahrirlash"}
          </SheetTitle>
          <SheetDescription>
            {isAdd
              ? "Yangi filial ma'lumotlarini kiriting"
              : "Filial ma\u2019lumotlarini o\u2018zgartirish"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <EditBranchForm
            branch={branch}
            onClose={closeDrawer}
            onSaved={onSaved}
            formId="edit-branch-form"
            isAdd={isAdd}
          />
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDrawer}>
              Bekor qilish
            </Button>
            <Button type="submit" form="edit-branch-form" disabled={submitting}>
              {submitting ? "Saqlanmoqda..." : isAdd ? "Qo'shish" : "Saqlash"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
