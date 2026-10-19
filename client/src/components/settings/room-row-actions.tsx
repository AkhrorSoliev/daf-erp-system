"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditRoom, type Room } from "@/hooks/use-edit-room";
import api from "@/lib/api";
import { useT } from "@/i18n/context";

interface RoomRowActionsProps {
  room: Room;
  onDeleted?: (id: string) => void;
}

export function RoomRowActions({ room, onDeleted }: RoomRowActionsProps) {
  const t = useT();
  const { openDrawer } = useEditRoom();

  const handleDelete = async () => {
    try {
      await api.delete(`/rooms/${room.id}`);
      toast.success(t("Xona muvaffaqiyatli o'chirildi"));
      onDeleted?.(room.id);
    } catch {
      toast.error(t("Xonani o'chirishda xatolik yuz berdi"));
    }
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
              <span className="sr-only">{t("Amallar")}</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("Amallar")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => openDrawer(room)}>
          <Pencil className="mr-2 size-4" />
          {t("Tahrirlash")}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={handleDelete}>
          <Trash2 className="mr-2 size-4" />
          {t("O'chirish")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
