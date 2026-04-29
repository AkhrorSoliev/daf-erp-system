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
import { useEditRoom, type Room } from "@/hooks/use-edit-room";
import { EditRoomForm } from "./edit-room-form";

interface EditRoomDrawerProps {
  onSaved?: (room: Room) => void;
}

export function EditRoomDrawer({ onSaved }: EditRoomDrawerProps) {
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
            {isAdd ? "Yangi xona qo'shish" : "Xonani tahrirlash"}
          </SheetTitle>
          <SheetDescription>
            {isAdd
              ? "Yangi xona ma'lumotlarini kiriting"
              : "Xona ma\u2018lumotlarini o\u2018zgartirish"}
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
            <Button type="button" variant="outline" onClick={closeDrawer} disabled={submitting}>
              Bekor qilish
            </Button>
            <Button type="submit" form="edit-room-form" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Saqlash
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
