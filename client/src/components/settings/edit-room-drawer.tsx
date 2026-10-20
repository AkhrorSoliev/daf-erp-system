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
import { useEditRoom, type Room } from "@/hooks/use-edit-room";
import { EditRoomForm } from "./edit-room-form";
import { useT } from "@/i18n/context";

interface EditRoomDrawerProps {
  onSaved?: (room: Room) => void;
}

export function EditRoomDrawer({ onSaved }: EditRoomDrawerProps) {
  const t = useT();
  const { open, room, isAdd, addBranchId, submitting, closeDrawer } =
    useEditRoom();

  if (!isAdd && !room) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && closeDrawer()}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">
            {isAdd ? t("Yangi xona qo'shish") : t("Xonani tahrirlash")}
          </SheetTitle>
          <SheetDescription>
            {isAdd
              ? t("Yangi xona ma'lumotlarini kiriting")
              : t("Xona ma'lumotlarini o'zgartirish")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <EditRoomForm
            room={room}
            onClose={closeDrawer}
            onSaved={onSaved}
            formId="edit-room-form"
            isAdd={isAdd}
            branchId={addBranchId}
          />
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDrawer}>
              {t("Bekor qilish")}
            </Button>
            <Button type="submit" form="edit-room-form" disabled={submitting}>
              {submitting ? t("Saqlanmoqda...") : t("Saqlash")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
